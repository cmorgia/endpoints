import * as cdk from '@aws-cdk/core';
import {VpcConstruct} from './vpcConstruct';
export class EndpointsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tgw = 'tgw-0fc759b09dddae5f6';
    const region = 'eu-central-1';

    const privateVpc = new VpcConstruct(this,'private',{
      cidr: '10.0.1.0/24',
      region: region,
      tgw: tgw,
      hasEndpoints: false,
      maxAz: 2,
      prefix: 'private'
    });
    
    const sharedVpc = new VpcConstruct(this,'shared',{
      cidr: '10.0.0.0/24',
      region: region,
      tgw: tgw,
      hasEndpoints: true,
      maxAz: 2,
      prefix: 'shared'
    });

  }
}
