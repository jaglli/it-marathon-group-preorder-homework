using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GuestSessions;
using APIHandler.Services.GuestSessions;
using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace APIHandler.Handlers.Reservations;

public class AddDishToOwnerSessionHandler(IGuestSessionService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("reservationId", out var reservationId))
            return ResponseBuilder.CreateErrorResponse(400, "Reservation id is required.", context.Logger);

        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (userId is null)
            return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);

        UpdateGuestSessionDishRequest? body;
        try
        {
            body = JsonSerializer.Deserialize<UpdateGuestSessionDishRequest>(
                request.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException)
        {
            return ResponseBuilder.CreateErrorResponse(400, "Invalid request body.", context.Logger);
        }

        if (body is null || string.IsNullOrWhiteSpace(body.DishId) || body.Quantity <= 0)
            return ResponseBuilder.CreateErrorResponse(400, "DishId is required and Quantity must be greater than zero.", context.Logger);

        try
        {
            await service.AddOwnerDishAsync(userId, reservationId, body.DishId, body.Quantity);
            return ResponseBuilder.CreateSuccessResponse("Dish added successfully.");
        }
        catch (ReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (GroupReservationNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (GuestSessionNotFoundException e) { return ResponseBuilder.CreateErrorResponse(404, e.Message, context.Logger); }
        catch (ActionForbiddenException e) { return ResponseBuilder.CreateErrorResponse(403, e.Message, context.Logger); }
        catch (GroupReservationExpiredException e) { return ResponseBuilder.CreateErrorResponse(409, e.Message, context.Logger); }
        catch (GroupReservationSubmittedException e) { return ResponseBuilder.CreateErrorResponse(409, e.Message, context.Logger); }
        catch (ValidationException e) { return ResponseBuilder.CreateErrorCodeResponse(e); }
    }
}
