// sort.js
import { promises as fs } from 'fs'
import { testConnection, updateConfig } from './test_proxy.mjs'
import dotenv from 'dotenv'

dotenv.config()

const guiConfigPath = process.env.GUI_CONFIG_PATH || './gui-config.json'
const MAX_HISTORY = 5 // Number of historical times to keep for average calculation

async function testConfigSpeed (config) {
  try {
    const startTime = Date.now()
    await updateConfig({
      server: config.server,
      serverPort: config.server_port,
      password: config.password,
      method: config.method || 'aes-256-gcm'
    })

    const connected = await testConnection()
    const endTime = Date.now()

    if (!connected) {
      return { config, responseTime: Infinity }
    }

    return { config, responseTime: endTime - startTime }
  } catch (error) {
    console.error(`Error testing ${config.remarks}:`, error.message)
    return { config, responseTime: Infinity }
  }
}

function updateAverageTime (config, newTime) {
  if (!config.responseTimes) {
    config.responseTimes = []
  }

  config.responseTimes.push(newTime)

  if (config.responseTimes.length > MAX_HISTORY) {
    config.responseTimes.shift() // Remove oldest time
  }

  const validTimes = config.responseTimes.filter(time => time !== Infinity)
  if (validTimes.length > 0) {
    config.averageTime = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length
  } else {
    config.averageTime = Infinity
  }
}

async function sortConfigs () {
  console.log('Reading config file...')
  let guiConfig

  try {
    const guiConfigContent = await fs.readFile(guiConfigPath, 'utf-8')
    guiConfig = JSON.parse(guiConfigContent)
  } catch (error) {
    console.error('Error reading gui-config.json:', error.message)
    return
  }

  const configs = guiConfig.configs
  const results = []

  console.log(`Testing ${configs.length} configurations...`)

  // Test each config
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]
    console.log(`Testing ${config.remarks} (${i + 1}/${configs.length})`)
    const result = await testConfigSpeed(config)
    updateAverageTime(result.config, result.responseTime)
    results.push(result)
  }

  // Sort results by average response time
  results.sort((a, b) => a.config.averageTime - b.config.averageTime)

  // Create summary
  console.log('\nResults Summary:')
  results.forEach((result, index) => {
    const time = result.responseTime === Infinity ? 'Failed' : `${result.responseTime}ms`
    const avgTime = result.config.averageTime === Infinity ? 'N/A' : `${result.config.averageTime.toFixed(2)}ms`
    console.log(`${index + 1}. ${result.config.remarks}: Current: ${time}, Average: ${avgTime}`)
  })

  // Update config file with sorted configs
  guiConfig.configs = results.map(result => result.config)

  try {
    await fs.writeFile(
      guiConfigPath,
      JSON.stringify(guiConfig, null, 2),
      'utf-8'
    )
    console.log('\nConfig file updated successfully with sorted configurations and average times')
  } catch (error) {
    console.error('Error writing to config file:', error.message)
  }
}

// Run the sorting
console.log('Starting config speed test and sort...')
sortConfigs().catch(error => {
  console.error('Error during execution:', error)
  process.exit(1)
})
