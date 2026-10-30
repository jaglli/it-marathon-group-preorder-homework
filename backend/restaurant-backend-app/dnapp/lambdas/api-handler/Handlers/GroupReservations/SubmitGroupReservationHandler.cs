using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GroupReservation;
using APIHandler.Services.GuestSessions;
using System.Text.Json;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GroupReservations;

public class SubmitGroupReservationHandler(IGuestSessionService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("groupReservationId", out var groupId))
            return ResponseBuilder.CreateErrorResponse(400, "Group reservation id is required.", context.Logger);
        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (userId is null) return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        SubmitGroupRequest? body;
        try { body = JsonSerializer.Deserialize<SubmitGroupRequest>(request.Body ?? ""); }
        catch (JsonException) { return ResponseBuilder.CreateErrorResponse(400, "Invalid request body.", context.Logger); }
        if (body is null || string.IsNullOrWhiteSpace(body.ReservationId))
            return ResponseBuilder.CreateErrorResponse(400, "Reservation id is required.", context.Logger);
        try { return ResponseBuilder.CreateSuccessResponse(await service.SubmitGroupAsync(userId, groupId, body.ReservationId)); }
        catch (GroupReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ActionForbiddenException e) { return ResponseBuilder.CreateErrorResponse(403, e.Message, context.Logger); }
        catch (ValidationException e) { return ResponseBuilder.CreateErrorCodeResponse(e); }
    }
}
