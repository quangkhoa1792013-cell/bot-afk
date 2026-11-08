using MinecraftClient.Mapping;
using MinecraftClient.Physics;

namespace MinecraftClient.Tests;

public sealed class PlayerPhysicsAbilitiesTests
{
    [Fact]
    public void IdleFlyingPlayerDoesNotFall()
    {
        var player = new PlayerPhysics
        {
            Position = new Vec3d(0.5, 110, 0.5),
            CreativeFlying = true
        };
        var world = new World();

        for (int tick = 0; tick < 20; tick++)
            player.Tick(world);

        Assert.Equal(110, player.Position.Y);
        Assert.Equal(0, player.DeltaMovement.Y);
    }

    [Fact]
    public void FlightDampsVerticalVelocityWithoutAddingGravity()
    {
        var player = new PlayerPhysics
        {
            Position = new Vec3d(0.5, 110, 0.5),
            DeltaMovement = new Vec3d(0, 0.3, 0),
            CreativeFlying = true
        };

        player.Tick(new World());

        Assert.Equal(110.3, player.Position.Y, 10);
        Assert.Equal(0.3 * PhysicsConsts.FlyVerticalDamping, player.DeltaMovement.Y, 10);
    }
}
