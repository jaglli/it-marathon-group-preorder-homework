using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Services.GuestSessions;
using System.Threading.Tasks;

namespace APIHandler.Handlers.Reservations;

public class GetOwnerGuestSessionIdHandler(IGuestSessionService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("reservationId", out var reservationId))
            return ResponseBuilder.CreateErrorResponse(400, "Reservation id is required.", context.Logger);
        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (userId is null) return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        try { return ResponseBuilder.CreateSuccessResponse(new { guestSessionId = await service.GetOwnerSessionIdAsync(userId, reservationId) }); }
        catch (ReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (GroupReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (GuestSessionNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ActionForbiddenException e) { return ResponseBuilder.CreateErrorResponse(403, e.Message, context.Logger); }
    }
}
