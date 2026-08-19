#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloudByteStack } from '../lib/cdk-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') ?? process.env.CDK_STAGE ?? 'dev';
const region = app.node.tryGetContext('region') ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';
const account = app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;

new CloudByteStack(app, 'CloudByteStack', {
  stage,
  appName: 'cloudbyte',
  env: {
    account,
    region,
  },
});
