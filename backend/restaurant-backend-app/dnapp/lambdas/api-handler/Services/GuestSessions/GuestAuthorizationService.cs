using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Helpers;
using System;
using System.Threading.Tasks;

namespace APIHandler.Services.GuestSessions;

public class GuestAuthorizationService(IGuestSessionService guestSessionService) : IGuestAuthorizationService
{
    public async ValueTask<APIGatewayProxyResponse?> ValidateAsync(APIGatewayProxyRequest request, ILambdaContext context, string guestSessionid)
    {
        if (!request.Headers.TryGetValue("Authorization", out string? authorizationValue))
            return CreateErrorResponse(context);

        const string BearerString = "Bearer ";
        if (!authorizationValue.StartsWith(BearerString) || authorizationValue.Length <= BearerString.Length)
            return CreateErrorResponse(context);

        string token = authorizationValue[BearerString.Length..];
        bool authorized = false;
        try
        {
            authorized = await guestSessionService.IsAuthorizedAsync(token, guestSessionid);
        }
        catch (FormatException)
        {
            // Cognito JWTs are not guest-session tokens; try owner authorization below.
        }
        catch (ArgumentException)
        {
            // Malformed bearer values must not turn into a server error.
        }
        if (!authorized)
        {
            string? userId = UserContextHelper.GetAuthenticatedUserId(request);
            authorized = userId is not null
                && await guestSessionService.IsOwnerAuthorizedAsync(userId, guestSessionid);
        }

        return !authorized ? CreateErrorResponse(context) : null;
    }

    private static APIGatewayProxyResponse CreateErrorResponse(ILambdaContext context)
        => ResponseBuilder.CreateErrorResponse(401, "Invalid guest session token", context.Logger);
}
