#!/bin/bash
cd "$(dirname "$0")"

echo "=================================================="
echo "🚀 Push LibreTV to GitHub for Render Deployment"
echo "=================================================="
echo ""

# Check if remote origin already exists
if git remote | grep -q 'origin'; then
  echo "Current remote origin: $(git remote get-url origin)"
else
  echo "Enter your GitHub repository URL (default: https://github.com/fondXD/libretv.git):"
  read -r repo_url
  if [ -z "$repo_url" ]; then
    repo_url="https://github.com/fondXD/libretv.git"
  fi
  git remote add origin "$repo_url"
  echo "Added remote origin: $repo_url"
fi

git branch -M main
echo "Pushing code to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Code pushed successfully to GitHub!"
  echo "👉 Next step: Go to https://dashboard.render.com/ to deploy with 1-click!"
else
  echo ""
  echo "⚠️ Push encountered an issue. Make sure you have created the repository on GitHub:"
  echo "   https://github.com/new (Name: libretv)"
fi
