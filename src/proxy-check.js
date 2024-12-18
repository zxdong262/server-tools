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

const PROXY_CONFIG = {
  socks5_address: process.env.SOCKS5_ADDRESS || '127.0.0.1',
  socks5_port: parseInt(process.env.SOCKS5_PORT || '1080'),
  tj_json_path: process.env.TJ_JSON_PATH || '/home/a/tj.json',
  pm2_script: process.env.PM2_SCRIPT || 'tj.sh'
}

export async function testConnection () {
  const agent = new SocksProxyAgent(`socks5://${PROXY_CONFIG.socks5_address}:${PROXY_CONFIG.socks5_port}`)

  return axios.get('https://google.com', {
    httpAgent: agent,
    httpsAgent: agent,
    timeout: parseInt(process.env.CONNECTION_TIMEOUT || '5000')
  }).then(() => true).catch((err) => {
    console.error('Error testing connection:', err.message)
    return false
  })
}

export async function updateConfig (config) {
  try {
    await fs.writeFile(PROXY_CONFIG.tj_json_path, JSON.stringify(config, null, 2))
    await execAsync(`pm2 reload ${PROXY_CONFIG.pm2_script}`)
    console.log('Config updated and proxy reloaded')
  } catch (error) {
    console.error('Error updating config:', error.message)
  }
}
