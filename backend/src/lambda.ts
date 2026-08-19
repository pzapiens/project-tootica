import serverless from 'serverless-http';

import { createApp } from './app';

// Serverless entry point — wraps the same Express app as server.ts so the app
// can run on AWS Lambda (behind API Gateway / a function URL) with no code
// changes. Unused today, but the pattern exists from day one.
//
// Deploy handler reference: `dist/lambda.handler`.
export const handler = serverless(createApp());
