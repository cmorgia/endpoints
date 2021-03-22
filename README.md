[![experimental](http://badges.github.io/stability-badges/dist/experimental.svg)](http://github.com/badges/stability-badges)

# Automated VPC Endpoints sharing across VPCs

This is an example of how to use AWS CDK to create a relatively complex solutions architecture
with much less complexity than a pure CloudFormation approach.

The current implementation has been tested in a multi-VPC single-account scenario but it can be easily
extended to a multi-account setup, especially using AWS Organizations.

The project also provides a classic **CloudFormation Serverless** template to help debug and test the
Lambda function that is responsible for the automatic register/deregister of the **client** VPC.

# How to use it

The standard **cdk** command line tool is used to deploy the solution architecture described in this project:

- **cdk synth** to generate the CloudFormation template and check for errors before deployment
- **cdk deploy** to deploy the solution n your configured AWS account

Please note that your terminal must be already configured to use the AWS CLI tool, including the credentials
to connect through your account.

# How to localy test the Lambda function

In order to easily test the registration Lambda function, it is advised to deploy first the CDK solution so
all the required resources will be available, including the shared VPC and the DynamoDB table.

Once the resources are available, a simple command like:

`sam build && sam local invoke TGWAttachFunction`

in the project's directory.

It is also possible to launch a debugging session with the command:

`sam build && sam local invoke -d 5890 TGWAttachFunction`

provided that you uncomment the lines 3 to 7 in lambda/tgwattach.py to enable the Python debugging session.
