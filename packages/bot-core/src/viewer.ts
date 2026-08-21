import type { Bot } from 'mineflayer'

export interface ViewerHandle {
  close: () => void
}

export function startViewer(
  bot: Bot,
  port: number,
  firstPerson: boolean
): ViewerHandle | null {
  try {
    const pv = require('prismarine-viewer')
    const viewer = pv.mineflayer(bot, { port, firstPerson })
    return {
      close: () => {
        try {
          viewer.close()
        } catch {}
      },
    }
  } catch (err) {
    return null
  }
}
