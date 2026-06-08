data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "wine_images" {
  bucket        = "${var.project_name}-wine-images-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Name    = "${var.project_name}-wine-images"
    Project = var.project_name
  }
}

resource "aws_s3_bucket_versioning" "wine_images" {
  bucket = aws_s3_bucket.wine_images.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "wine_images" {
  bucket = aws_s3_bucket.wine_images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "wine_images" {
  bucket = aws_s3_bucket.wine_images.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "wine_images_public_read" {
  bucket = aws_s3_bucket.wine_images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadWineImages"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.wine_images.arn}/wines/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.wine_images]
}

locals {
  s3_public_base_url = "https://${aws_s3_bucket.wine_images.bucket}.s3.${var.aws_region}.amazonaws.com"
}
