using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public class SubmitGroupRequest
{
    [JsonPropertyName("reservationId")]
    public string? ReservationId { get; set; }
}
