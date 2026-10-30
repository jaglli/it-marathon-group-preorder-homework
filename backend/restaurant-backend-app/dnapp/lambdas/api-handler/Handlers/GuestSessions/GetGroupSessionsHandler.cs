using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Services.GuestSessions;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GuestSessions;

public class GetGroupSessionsHandler(IGuestSessionService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("groupReservationId", out var groupId))
            return ResponseBuilder.CreateErrorResponse(400, "Group reservation id is required.", context.Logger);
        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (userId is null) return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        try { return ResponseBuilder.CreateSuccessResponse(await service.GetGroupSessionsAsync(userId, groupId)); }
        catch (GroupReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ActionForbiddenException e) { return ResponseBuilder.CreateErrorResponse(403, e.Message, context.Logger); }
        catch (ValidationException e) { return ResponseBuilder.CreateErrorCodeResponse(e); }
    }
}
