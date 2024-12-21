const express = require('express')
const crypto = require('crypto')
const fs = require('fs').promises
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')
require('dotenv').config()

const execAsync = promisify(exec)
const app = express()

// Parse environment variables
const watchBranches = process.env.WATCH_BRANCHES
  ? process.env.WATCH_BRANCHES.split(',').map(b => b.trim())
  : []
const skipKeywords = process.env.SKIP_KEYWORDS
  ? process.env.SKIP_KEYWORDS.split(',').map(k => k.trim().toLowerCase())
  : []

// Use raw body for webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))

// Verify GitHub webhook signature
function verifyGitHubWebhook (req, res, next) {
  const signature = req.headers['x-hub-signature-256']
  if (!signature) {
    return res.status(401).send('No signature')
  }

  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex')

  if (signature !== digest) {
    return res.status(401).send('Invalid signature')
  }

  next()
}

// Check if commit message contains skip keywords
function shouldSkipBuild (commitMessage) {
  if (!commitMessage) return false

  const lowerMessage = commitMessage.toLowerCase()
  return skipKeywords.some(keyword => {
    const pattern = `[${keyword}]`
    return lowerMessage.includes(pattern)
  })
}

// Ensure data folder exists
async function ensureDataFolder () {
  try {
    await fs.access(process.env.DATA_FOLDER)
  } catch {
    await fs.mkdir(process.env.DATA_FOLDER, { recursive: true })
  }
}

// Generate filename with timestamp
function generateFilename () {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `webhook-${timestamp}.json`
}

// Execute post-save script
async function runPostSaveScript (jsonFilePath) {
  if (!process.env.POST_SAVE_SCRIPT) return

  try {
    const { stdout, stderr } = await execAsync(`${process.env.POST_SAVE_SCRIPT} "${jsonFilePath}"`)
    console.log('Script output:', stdout)
    if (stderr) console.error('Script errors:', stderr)
  } catch (error) {
    console.error('Error executing post-save script:', error)
    throw error
  }
}

// Webhook handler
app.post(process.env.WEBHOOK_PATH, verifyGitHubWebhook, async (req, res) => {
  try {
    // Only process push events
    if (req.headers['x-github-event'] !== 'push') {
      return res.status(200).json({
        status: 'ignored',
        message: 'Not a push event'
      })
    }

    // Check branch
    const branch = req.body.ref.split('/').pop()
    if (!watchBranches.includes(branch)) {
      return res.status(200).json({
        status: 'ignored',
        message: `Branch ${branch} is not in watch list`
      })
    }

    // Check for skip keywords in the commit message
    const headCommit = req.body.head_commit
    if (headCommit && shouldSkipBuild(headCommit.message)) {
      return res.status(200).json({
        status: 'skipped',
        message: 'Build skipped due to commit message'
      })
    }

    // Process the webhook
    await ensureDataFolder()
    const filename = generateFilename()
    const filePath = path.join(process.env.DATA_FOLDER, filename)

    // Save webhook data
    await fs.writeFile(
      filePath,
      JSON.stringify({
        event: 'push',
        branch,
        commit: headCommit,
        timestamp: new Date().toISOString(),
        repository: req.body.repository,
        sender: req.body.sender
      }, null, 2),
      'utf8'
    )

    console.log(`Webhook data saved to ${filePath}`)
    console.log(`Processing push to ${branch} from ${headCommit?.author?.name}`)

    // Run build and upload script
    await runPostSaveScript(filePath)

    res.status(200).json({
      status: 'success',
      filename,
      branch,
      commit: headCommit?.id
    })
  } catch (error) {
    console.error('Error processing webhook:', error)
    res.status(500).json({
      status: 'error',
      message: 'Failed to process webhook',
      error: error.message
    })
  }
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: err.message
  })
})

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`)
  console.log(`Webhook endpoint: ${process.env.WEBHOOK_PATH}`)
  console.log(`Watching branches: ${watchBranches.join(', ')}`)
  console.log(`Skip keywords: ${skipKeywords.join(', ')}`)
  console.log(`Saving data to: ${process.env.DATA_FOLDER}`)
  if (process.env.POST_SAVE_SCRIPT) {
    console.log(`Post-save script: ${process.env.POST_SAVE_SCRIPT}`)
  }
})
