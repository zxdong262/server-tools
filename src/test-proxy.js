// scheduler.mjs
import dotenv from 'dotenv'
import { testConnection } from './proxy-check.js'

// Load environment variables
dotenv.config()

testConnection()
