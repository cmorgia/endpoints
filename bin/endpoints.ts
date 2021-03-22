#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EndpointsStack } from '../lib/endpoints-stack';

const app = new cdk.App();
new EndpointsStack(app, 'EndpointsStack');
