// test-webhook-suite.js
import axios from 'axios'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const WEBHOOK_URL = `http://localhost:${process.env.PORT || 3000}${process.env.WEBHOOK_PATH || '/webhook'}`
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET
const BUILD_BRANCHES = (process.env.BUILD_BRANCHES || '').split(',').map(b => b.trim())
const SKIP_KEYWORDS = (process.env.SKIP_KEYWORDS || '').split(',').map(k => k.trim())

function createSignature (body) {
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex')
  return `sha256=${signature}`
}

async function sendWebhook (payload, options = {}) {
  const signature = options.invalidSignature ? 'sha256=invalid' : createSignature(payload)
  const event = options.event || 'push'

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'X-GitHub-Event': event,
        'X-Hub-Signature-256': signature,
        'Content-Type': 'application/json'
      }
    })
    return { success: true, status: response.status, data: response.data }
  } catch (error) {
    return {
      success: false,
      status: error.response?.status,
      data: error.response?.data
    }
  }
}

const testCases = [
  {
    name: 'Valid push to build branch',
    payload: {
      ref: `refs/heads/${BUILD_BRANCHES[0]}`,
      commits: [{ message: 'Regular commit' }]
    },
    expectedStatus: 200
  },
  {
    name: 'Push with skip keyword',
    payload: {
      ref: `refs/heads/${BUILD_BRANCHES[0]}`,
      commits: [{ message: `Test commit ${SKIP_KEYWORDS[0]}` }]
    },
    expectedStatus: 200,
    expectedData: { status: 'skipped' }
  },
  {
    name: 'Push to non-build branch',
    payload: {
      ref: 'refs/heads/some-other-branch',
      commits: [{ message: 'Test commit' }]
    },
    expectedStatus: 200,
    expectedData: { status: 'skipped' }
  },
  {
    name: 'Invalid signature',
    payload: {
      ref: `refs/heads/${BUILD_BRANCHES[0]}`,
      commits: [{ message: 'Test commit' }]
    },
    options: { invalidSignature: true },
    expectedStatus: 401
  },
  {
    name: 'Non-push event',
    payload: {},
    options: { event: 'pull_request' },
    expectedStatus: 200,
    expectedData: { status: 'ignored' }
  }
]

async function runTest (testCase) {
  console.log(`\nRunning test: ${testCase.name}`)
  const result = await sendWebhook(testCase.payload, testCase.options)

  const statusMatch = result.status === testCase.expectedStatus
  const dataMatch = !testCase.expectedData ||
    JSON.stringify(result.data).includes(JSON.stringify(testCase.expectedData))

  console.log('Status:', result.status, statusMatch ? '✅' : '❌')
  console.log('Response:', result.data)

  if (!statusMatch || !dataMatch) {
    console.log('Test failed!')
    console.log('Expected status:', testCase.expectedStatus)
    if (testCase.expectedData) {
      console.log('Expected data to include:', testCase.expectedData)
    }
  } else {
    console.log('Test passed! ✅')
  }

  return statusMatch && dataMatch
}

async function runAllTests () {
  console.log('Starting webhook tests...')
  console.log(`Server URL: ${WEBHOOK_URL}`)
  console.log(`Build branches: ${BUILD_BRANCHES.join(', ')}`)
  console.log(`Skip keywords: ${SKIP_KEYWORDS.join(', ')}`)

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    const success = await runTest(testCase)
    if (success) passed++
    else failed++
  }

  console.log('\nTest Summary:')
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${testCases.length}`)

  if (failed > 0) process.exit(1)
}

runAllTests().catch(console.error)
