// test_proxy.mjs
import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import dotenv from 'dotenv'

const execAsync = promisify(exec)

// Load environment variables
dotenv.config()

const socks5Address = process.env.PROXY_URL || 'socks5://127.0.0.1:1080'
const dataPath = process.env.DATA_PATH || '/home/a/tj.json'
const pm2Script = process.env.PM2_SCRIPT || 'pm2 reload tj'
const testUrl = process.env.TEST_URL || 'https://github.com'

export async function testConnection () {
  const agent = new SocksProxyAgent(socks5Address)
  return axios.get(testUrl, {
    httpAgent: agent,
    httpsAgent: agent,
    timeout: parseInt(process.env.CONNECTION_TIMEOUT || 5000)
  })
    .then(() => true)
    .catch((err) => {
      console.error('Error testing connection:', err.message)
      return false
    })
}

export async function updateConfig (config) {
  try {
    await fs.writeFile(dataPath, JSON.stringify(config, null, 2))
    await execAsync(`pm2 reload ${pm2Script}`)
    console.log('Config updated and proxy reloaded')
  } catch (error) {
    console.error('Error updating config:', error.message)
  }
}
