using System.Text;
using App.Tests.Harness;

namespace App.Tests.E2E;

/// <summary>One way to execute a harness case, shared by the conformance run and the capture.</summary>
public static class Replay
{
    public static async Task<(int Status, string ContentType, string Body)> Execute(HttpClient client, HarnessCase harnessCase)
    {
        using var request = new HttpRequestMessage(new HttpMethod(harnessCase.Method), harnessCase.Path);
        if (harnessCase.Body is not null)
        {
            request.Content = new StringContent(harnessCase.Body, Encoding.UTF8, "application/json");
        }
        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        var contentType = response.Content.Headers.ContentType?.ToString() ?? "";
        return ((int)response.StatusCode, contentType, body);
    }
}
