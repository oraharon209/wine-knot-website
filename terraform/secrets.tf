resource "random_password" "admin" {
  length  = 24
  special = false
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "random_password" "mysql_root" {
  length  = 24
  special = false
}

locals {
  admin_password_value       = var.admin_password != "" ? var.admin_password : random_password.admin.result
  cloudflare_api_token_value = var.cloudflare_api_token
}

resource "aws_ssm_parameter" "admin_password" {
  name  = "/${var.project_name}/admin_password"
  type  = "SecureString"
  value = local.admin_password_value

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.project_name}/db_password"
  type  = "SecureString"
  value = random_password.db.result

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "mysql_root_password" {
  name  = "/${var.project_name}/mysql_root_password"
  type  = "SecureString"
  value = random_password.mysql_root.result

  tags = {
    Project = var.project_name
  }
}

resource "aws_ssm_parameter" "cloudflare_api_token" {
  name  = "/${var.project_name}/cloudflare_api_token"
  type  = "SecureString"
  value = local.cloudflare_api_token_value

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_role_policy" "ssm_read" {
  name = "${var.project_name}-ssm-read"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ]
      Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.project_name}/*"
    }]
  })
}

resource "aws_iam_role_policy" "s3_images" {
  name = "${var.project_name}-s3-images"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.wine_images.arn,
        "${aws_s3_bucket.wine_images.arn}/wines/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_ssm_managed" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2"
  role = aws_iam_role.ec2.name
}

resource "aws_iam_user" "github_actions_deploy" {
  name = "${var.project_name}-github-actions-deploy"

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_user_policy" "github_actions_deploy" {
  name = "${var.project_name}-github-actions-ssm"
  user = aws_iam_user.github_actions_deploy.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:document/AWS-RunShellScript",
          "arn:aws:ec2:${var.aws_region}:*:instance/${aws_instance.web.id}"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.wine_images.arn,
          "${aws_s3_bucket.wine_images.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_access_key" "github_actions_deploy" {
  user = aws_iam_user.github_actions_deploy.name
}
