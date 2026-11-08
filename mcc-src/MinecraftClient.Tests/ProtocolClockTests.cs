using System.Diagnostics;
using System.Reflection;
using MinecraftClient.Protocol.Handlers;

namespace MinecraftClient.Tests;

public sealed class ProtocolClockTests
{
    [Fact]
    public void ProtocolNanosecondsUseTheRuntimeStopwatchFrequency()
    {
        MethodInfo clock = typeof(Protocol18Handler).GetMethod("GetNanos",
            BindingFlags.NonPublic | BindingFlags.Static)!;

        long before = Stopwatch.GetTimestamp();
        long actual = (long)clock.Invoke(null, null)!;
        long after = Stopwatch.GetTimestamp();

        // GetElapsedTime performs the runtime's own timestamp conversion.
        double minimum = Stopwatch.GetElapsedTime(0, before).TotalSeconds * 1_000_000_000;
        double maximum = Stopwatch.GetElapsedTime(0, after).TotalSeconds * 1_000_000_000;
        Assert.InRange((double)actual, minimum - 1_000, maximum + 1_000);
    }
}
