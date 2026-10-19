//MCCScript 1.0

MCC.LoadBot(new TickEndBot());

//MCCScript Extensions
//using System.Reflection
//using MinecraftClient.Protocol.Handlers

/// <summary>
/// Sends the 1.21.2+ Client Tick End and Player Input packets every client tick.
/// Some modern anti-bot/anti-cheat plugins expect a vanilla-like packet cadence.
/// The public ChatBot API has no raw packet sender, so we call the private
/// Protocol18Handler.SendPacket method through reflection.
/// </summary>
public class TickEndBot : ChatBot
{
    private object? protocol;
    private MethodInfo? sendPacket;
    private bool ready;
    private int errorCount;

    private void InitReflection()
    {
        if (ready || sendPacket is not null)
            return;

        try
        {
            FieldInfo? field = typeof(McClient).GetField(
                "handler", BindingFlags.NonPublic | BindingFlags.Instance);
            protocol = field?.GetValue(Handler);

            if (protocol != null)
            {
                sendPacket = protocol.GetType().GetMethod(
                    "SendPacket",
                    BindingFlags.NonPublic | BindingFlags.Instance,
                    null,
                    new[] { typeof(PacketTypesOut), typeof(IEnumerable<byte>) },
                    null);
            }

            if (sendPacket != null)
            {
                ready = true;
                LogToConsole($"[TickEnd] ready handler={protocol?.GetType().Name}");
            }
        }
        catch (Exception e)
        {
            LogToConsole("[TickEnd] init error: " + e.Message);
        }
    }

    public override void AfterGameJoined()
    {
        // Handler is guaranteed to be assigned here; connect as early as possible
        // in case Update() runs before the handler is attached.
        InitReflection();
    }

    public override void Update()
    {
        if (protocol is null)
            InitReflection();

        if (!ready)
            return;

        try
        {
            sendPacket!.Invoke(protocol, new object[] { PacketTypesOut.ClientTickEnd, Array.Empty<byte>() });
            sendPacket!.Invoke(protocol, new object[] { PacketTypesOut.SteerVehicle, new byte[] { 0 } });
        }
        catch (Exception e)
        {
            errorCount++;
            if (errorCount <= 3)
                LogToConsole("[TickEnd] send error: " + e.Message);
            if (errorCount > 20)
                ready = false;
        }
    }
}
