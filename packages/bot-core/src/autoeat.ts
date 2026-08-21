import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'

interface FoodInfo {
  foodPoints: number
  saturation: number
}

interface AutoEatOptions {
  enabled: boolean
  startAtFood: number
  lowHealth: number
  bannedFood: Set<string>
}

export class AutoEater {
  private eating = false
  private foodMap = new Map<string, FoodInfo>()

  constructor(
    private bot: Bot,
    private opts: AutoEatOptions
  ) {}

  updateOptions(patch: Partial<AutoEatOptions>): void {
    Object.assign(this.opts, patch)
  }

  isBusy(): boolean {
    return this.eating
  }

  async buildFoodMap(): Promise<void> {
    const mcData = require('minecraft-data')(this.bot.version)
    this.foodMap.clear()
    for (const [name, f] of Object.entries(mcData.foodsByName as Record<string, any>)) {
      this.foodMap.set(name, {
        foodPoints: Number(f.foodPoints) || 0,
        saturation: Number(f.saturation) || 0,
      })
    }
  }

  shouldEat(): boolean {
    if (!this.opts.enabled || this.eating) return false
    const food = this.bot.food ?? 20
    const health = this.bot.health ?? 20
    return food <= this.opts.startAtFood || health <= this.opts.lowHealth
  }

  findBestFood(): Item | null {
    let best: Item | null = null
    let bestPoints = -1
    for (const item of this.bot.inventory.items()) {
      if (this.opts.bannedFood.has(item.name)) continue
      const info = this.foodMap.get(item.name)
      if (!info || info.foodPoints <= 0) continue
      if (info.foodPoints > bestPoints) {
        best = item
        bestPoints = info.foodPoints
      }
    }
    return best
  }

  async tick(): Promise<void> {
    if (!this.shouldEat()) return
    const food = this.findBestFood()
    if (!food) return
    this.eating = true
    try {
      await this.bot.equip(food, 'hand')
      await this.bot.consume()
    } catch {
    } finally {
      this.eating = false
    }
  }
}
