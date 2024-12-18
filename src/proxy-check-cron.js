// scheduler.mjs
import { CronJob } from 'cron'
import dotenv from 'dotenv'
import { testConnection, updateConfig } from './test_proxy.js'
import fs from 'fs/promises'

// Load environment variables
dotenv.config()

const checkIntervalSeconds = parseInt(process.env.CHECK_INTERVAL_SECONDS || '300')
const guiConfigPath = process.env.GUI_CONFIG_PATH || './gui-config.json'

let isCheckInProgress = false

async function runProxyCheck () {
  if (isCheckInProgress) {
    console.log('A proxy check is already in progress. Skipping this run.')
    return
  }

  isCheckInProgress = true
  console.log('Running proxy check...')

  try {
    if (await testConnection()) {
      console.log('Connection successful, quitting')
      return
    }

    console.log('Initial connection failed. Trying other configurations...')

    let guiConfig
    try {
      const guiConfigContent = await fs.readFile(guiConfigPath, 'utf-8')
      guiConfig = JSON.parse(guiConfigContent)
    } catch (error) {
      console.error('Error reading gui-config.json:', error.message)
      return
    }

    const configs = guiConfig.configs
    for (const config of configs) {
      console.log(`Trying config: ${config.remarks}`)
      await updateConfig({
        server: config.server,
        serverPort: config.server_port,
        password: config.password,
        method: config.method || 'aes-256-gcm'
      })

      if (await testConnection()) {
        console.log(`Connection successful with config: ${config.remarks}`)
        return
      }
    }

    console.log('No working configuration found')
  } finally {
    isCheckInProgress = false
  }
}

// Convert seconds to cron expression
function secondsToCronExpression (seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${remainingSeconds} */${minutes} * * * *`
}

const cronExpression = secondsToCronExpression(checkIntervalSeconds)
console.log(`Starting proxy check scheduler. Cron expression: ${cronExpression}`)

// Create a new CronJob
const job = new CronJob(
  cronExpression,
  runProxyCheck,
  null,
  true,
  'UTC'
)

// Start the job
job.start()

// Run an initial check immediately
runProxyCheck()
