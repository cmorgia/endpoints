import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as r53 from '@aws-cdk/aws-route53';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as dynamo from '@aws-cdk/aws-dynamodb';
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import { InterfaceVpcEndpointTarget } from '@aws-cdk/aws-route53-targets';
import { RemovalPolicy } from '@aws-cdk/core';
import { RetentionDays } from '@aws-cdk/aws-logs'

export interface VpcConstructProps {
    cidr: string;
    region: string;
    tgw: string;
    maxAz: number;
    prefix: string;
    hasEndpoints: boolean;
};

export class VpcConstruct extends cdk.Construct {
    public readonly vpc: ec2.Vpc;

    constructor(scope: cdk.Construct, id: string, props: VpcConstructProps) {
        super(scope, id);

        this.vpc = new ec2.Vpc(this, `${props.prefix}Vpc`, {
            cidr: props.cidr,
            maxAzs: props.maxAz,
            subnetConfiguration: [{
                subnetType: ec2.SubnetType.ISOLATED,
                name: `${props.prefix}Isolated`
            }]
        });

        const bastion = new ec2.BastionHostLinux(this, `${props.prefix}Bastion`, {
            vpc: this.vpc,
            instanceName: `${props.prefix}Bastion`,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.MICRO)
        });

        bastion.instance.addToRolePolicy(new PolicyStatement({
            actions: [
                'logs:*',
            ],
            resources: ['*']
        }));

        const tgwAttachment = new ec2.CfnTransitGatewayAttachment(this, `${props.prefix}Attachment`, {
            transitGatewayId: props.tgw,
            vpcId: this.vpc.vpcId,
            subnetIds: this.vpc.isolatedSubnets.map(isolatedSubnet => isolatedSubnet.subnetId)
        });

        this.vpc.isolatedSubnets.map((isolatedSubnet, index) => {
            new ec2.CfnRoute(this, `routeToTGW${index}`, {
                routeTableId: isolatedSubnet.routeTable.routeTableId,
                destinationCidrBlock: '0.0.0.0/0',
                transitGatewayId: props.tgw
            }).addDependsOn(tgwAttachment);
        });

        if (props.hasEndpoints) {
            const endpointSG = new ec2.SecurityGroup(this, `${props.prefix}EndpointSG`, {
                vpc: this.vpc,
                securityGroupName: `${props.prefix}EndpointSG`,
                allowAllOutbound: true
            });

            endpointSG.addIngressRule(ec2.Peer.ipv4(props.cidr), ec2.Port.tcp(443));

            var zones = []
            for (var svc of ['ssm', 'ssmmessages', 'ec2messages', 'logs']) {
                const phz = new r53.PrivateHostedZone(this, `${svc}PHZ`, {
                    vpc: this.vpc,
                    zoneName: `${svc}.${props.region}.amazonaws.com`
                });
                zones.push(phz.hostedZoneId)

                const endpoint = new ec2.InterfaceVpcEndpoint(this, `${svc}${props.prefix}Endpoint`, {
                    service: {
                        name: `com.amazonaws.${props.region}.${svc}`,
                        port: 443
                    },
                    vpc: this.vpc,
                    securityGroups: [endpointSG],
                    privateDnsEnabled: false
                });

                new r53.ARecord(this, `${svc}AliasRecord`, {
                    zone: phz,
                    target: r53.RecordTarget.fromAlias(new InterfaceVpcEndpointTarget(endpoint))
                });

            }

            const table = new dynamo.Table(this, "TGWAttachments", {
                tableName: "TGWAttachments",
                partitionKey: { name: "vpcId", type: dynamo.AttributeType.STRING },
                removalPolicy: RemovalPolicy.DESTROY
            });

            const lambdaFn = new lambda.Function(this, 'TGWAttachment', {
                code: lambda.Code.fromAsset('lambda'),
                handler: 'tgwattach.handler',
                timeout: cdk.Duration.seconds(300),
                runtime: lambda.Runtime.PYTHON_3_8,
                logRetention: RetentionDays.ONE_DAY,
                environment: {
                    tgw: props.tgw,
                    table: 'TGWAttachments',
                    endpointSG: endpointSG.securityGroupId,
                    zones: zones.join(','),
                    sharedVpc: this.vpc.vpcId
                },
                initialPolicy: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ['ec2:*'],
                        resources: [`*`]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ['route53:*'],
                        resources: [`*`]
                    })
                ]
            });

            table.grantReadWriteData(lambdaFn)

            const rule = new events.Rule(this, 'Rule', {
                schedule: events.Schedule.rate(cdk.Duration.hours(4))
            });

            rule.addTarget(new targets.LambdaFunction(lambdaFn));
        }


    }
}
