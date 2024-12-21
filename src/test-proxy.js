// scheduler.mjs
import dotenv from 'dotenv'
import { testConnection } from './test_proxy.js'

// Load environment variables
dotenv.config()

testConnection()
