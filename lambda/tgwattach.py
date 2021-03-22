import os
import boto3
# import ptvsd

# # Enable ptvsd on 0.0.0.0 address and on port 5890 that we'll connect later with our IDE
# ptvsd.enable_attach(address=('0.0.0.0', 5890), redirect_output=True)
# ptvsd.wait_for_attach()

ec2 = boto3.client('ec2')
r53 = boto3.client('route53')
dynamo = boto3.resource('dynamodb')

def deleteAssociation(vpcId,cidr,zones,sg):
    # remove association from Route53 PHZs
    # remove ingress from endpointSG
    ec2.revoke_security_group_ingress(
        GroupId=sg,
        IpPermissions=[
            {'IpProtocol': 'tcp',
             'FromPort': 443,
             'ToPort': 443,
             'IpRanges': [{'CidrIp': cidr}]}
        ]
    )

    for zone in zones:
        response = r53.disassociate_vpc_from_hosted_zone(
            HostedZoneId=zone,
            VPC={
                'VPCRegion': 'eu-central-1',
                'VPCId': vpcId
            }
        )

def createAssociation(vpcId,cidr,zones,sg):
    # remove association from Route53 PHZs
    # remove ingress from endpointSG
    ec2.authorize_security_group_ingress(
        GroupId=sg,
        IpPermissions=[
            {'IpProtocol': 'tcp',
             'FromPort': 443,
             'ToPort': 443,
             'IpRanges': [{'CidrIp': cidr}]}
        ])

    for zone in zones:
        response = r53.associate_vpc_with_hosted_zone(
            HostedZoneId=zone,
            VPC={
                'VPCRegion': 'eu-central-1',
                'VPCId': vpcId
            }
        )
        
def getCidr(vpcId):
    response = ec2.describe_vpcs(
        VpcIds=[
            vpcId
        ]
    )

    return response['Vpcs'][0]['CidrBlock']

def handler(event, context):
    print("Entering lambda for transit gateway attachments processing")
    
    tgwid = os.environ['tgw'] if 'tgw' in os.environ else ''
    tableName = os.environ['table'] if 'table' in os.environ else ''
    endpointSG = os.environ['endpointSG'] if 'endpointSG' in os.environ else ''
    zones = os.environ['zones'].split(',') if 'zones' in os.environ else ''
    sharedVpc = os.environ['sharedVpc'] if 'sharedVpc' in os.environ else ''

    print("Processing attachments for transit gateway "+tgwid)
    
    response = ec2.describe_transit_gateway_attachments(
        Filters=[
            {
                'Name': 'transit-gateway-id',
                'Values': [
                    tgwid
                ]
            }
        ]
    )

    attachments = []
    for attachment in response['TransitGatewayAttachments']:
        print("Considering attachment "+attachment['TransitGatewayAttachmentId'])
        if attachment['ResourceType'] == 'vpc' and attachment['State'] == 'available':
            print("Processed attachment, vpc to process is "+attachment['ResourceId'])
            attachments.append(attachment['ResourceId'])

    print("Preparing to scan DynamoDB table "+tableName)
    table = dynamo.Table(tableName)
    response = table.scan()
    items = response['Items']

    vpcs = {}

    print("Processing table entries")
    # scanning Dynamo table to purge old attachments
    for item in items:
        print("Considering entry for vpc "+item['vpcId']+" with CIDR "+item['cidr'])
        vpcid = item['vpcId']
        cidr = item['cidr']

        if vpcid not in attachments:
            print("Entry is stale, removing association")
            deleteAssociation(vpcid,cidr,zones,endpointSG)

            print("Removing entry in DynamoDB table")
            table.delete_item(
                Key={
                    'vpcId': vpcid
                }
            )

            print("Entry processed")
        else:
            print("Entry is valid, keeping it for further processing")
            vpcs[vpcid] = cidr

    # scanning new attachments (not already in Dynamo) to createAssociation
    print("Preparing to process transit gateway attachments")
    for vpcid in attachments:

        print("Considering attached vpc "+vpcid)
        if vpcid not in vpcs and vpcid!=sharedVpc:

            print("VPC is elibile for processing")
            cidr = getCidr(vpcid)

            print("VPC CIDR is "+cidr)
            createAssociation(vpcid,cidr,zones,endpointSG)

            print("Adding VPC to DynamoDB table")
            table.put_item(
                Item={
                    'vpcId': vpcid,
                    'cidr': cidr
                }
            )

            print("Finished processing VPC "+vpcid)

    print("OK")
