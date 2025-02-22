import path from 'path'

import Commando, { Response } from '../helpers/commando'
import { isDebug } from '../../src/utils/env'

export default function initProject(dirPath, installDep = true) {
  return new Promise<void>((resolve) => {
    const cmd = new Commando(
      `node ${path.resolve('dist', 'index.js')} init -p scene`,
      {
        silent: !isDebug(),
        workingDir: dirPath,
        env: { NODE_ENV: 'development' }
      }
    ).when(/Send anonymous usage stats to Decentraland?/, () => Response.NO)

    if (!installDep) {
      cmd.endWhen(/Installing dependencies/)
    }

    cmd.on('end', async () => {
      resolve()
    })
  })
}
