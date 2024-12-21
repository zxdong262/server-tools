// download-config.js

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import dotenv from 'dotenv'
import { CronJob } from 'cron'
import crypto from 'crypto'

dotenv.config()

const GUI_CONFIG_PATH = process.env.GUI_CONFIG_PATH || './gui-config.json'
const DOWNLOAD_INTERVAL = parseInt(process.env.DOWNLOAD_INTERVAL || '7')
const DOWNLOAD_DATA_URL = process.env.DOWNLOAD_DATA_URL

if (!DOWNLOAD_DATA_URL) {
  console.error('DOWNLOAD_DATA_URL is not set in the environment variables.')
  process.exit(1)
}

function verifyConfigStructure (config) {
  // Check if it's an object
  if (typeof config !== 'object' || config === null) {
    throw new Error('Config is not an object')
  }

  // Check if configs array exists and is not empty
  if (!Array.isArray(config.configs) || config.configs.length === 0) {
    throw new Error('configs array is missing or empty')
  }

  // Check structure of each config in the array
  config.configs.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Config item at index ${index} is not an object`)
    }
    // Check for required fields in each config item
    const requiredFields = ['server', 'server_port', 'password', 'method']
    requiredFields.forEach(field => {
      if (!(field in item)) {
        throw new Error(`Config item at index ${index} is missing required field: ${field}`)
      }
    })
  })

  // If we've made it this far, the structure is valid
  return true
}

async function verifyJsonFile (filePath) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    const jsonContent = JSON.parse(fileContent)
    return verifyConfigStructure(jsonContent)
  } catch (error) {
    console.error('Error verifying JSON file:', error.message)
    return false
  }
}

async function downloadConfig () {
  const tempFilePath = path.join(path.dirname(GUI_CONFIG_PATH), `.temp-${crypto.randomBytes(8).toString('hex')}.json`)

  try {
    console.log('Downloading gui-config.json...')
    const response = await axios({
      method: 'get',
      url: DOWNLOAD_DATA_URL,
      responseType: 'stream',
      proxy: false
    })

    const writer = fs.createWriteStream(tempFilePath)

    await pipeline(response.data, writer)

    console.log('Download completed. Verifying file...')

    if (await verifyJsonFile(tempFilePath)) {
      await fs.promises.rename(tempFilePath, GUI_CONFIG_PATH)
      console.log(`Config file successfully downloaded and saved to ${GUI_CONFIG_PATH}`)
    } else {
      throw new Error('Downloaded file is not a valid gui-config.json')
    }
  } catch (error) {
    console.error('Error downloading or verifying config file:', error.message)
    try {
      await fs.promises.unlink(tempFilePath)
    } catch (unlinkError) {
      // Ignore if file doesn't exist
    }
  }
}

const cronExpression = `0 0 */${DOWNLOAD_INTERVAL} * *`

console.log(`Scheduling config download every ${DOWNLOAD_INTERVAL} days.`)
console.log(`Cron expression: ${cronExpression}`)

const job = new CronJob(
  cronExpression,
  downloadConfig,
  null,
  true,
  'UTC'
)

job.start()
downloadConfig()

console.log('Config download scheduler started.')
