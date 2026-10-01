#!/bin/bash

# Linkora-socials Release Script
# This script automates version bumping, changelog updates, and git tagging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if tag already exists
tag_exists() {
    git rev-parse "$1" >/dev/null 2>&1
}

# Function to get current version from contract Cargo.toml
get_current_version() {
    grep -m 1 "^version = " packages/contracts/contracts/linkora-contracts/Cargo.toml | sed 's/version = "\(.*\)"/\1/'
}

# Function to get current version from root package.json
get_root_version() {
    grep -m 1 "\"version\":" package.json | sed 's/.*"version": "\(.*\)".*/\1/'
}

# Function to update version in Cargo.toml
update_contract_version() {
    local new_version=$1
    sed -i.bak "s/^version = .*/version = \"$new_version\"/" packages/contracts/contracts/linkora-contracts/Cargo.toml
    rm packages/contracts/contracts/linkora-contracts/Cargo.toml.bak
    print_info "Updated contract version to $new_version"
}

# Function to update version in root package.json
update_root_version() {
    local new_version=$1
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$new_version\"/" package.json
    rm package.json.bak
    print_info "Updated root package.json version to $new_version"
}

# Function to generate changelog from conventional commits
generate_changelog() {
    local version=$1
    print_info "Generating changelog for version $version from conventional commits..."

    # Ensure CHANGELOG.md exists with standard header if not present
    if [ ! -f CHANGELOG.md ]; then
        cat > CHANGELOG.md << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.
See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

EOF
    fi

    # Generate changelog from conventional commits grouped by Features, Bug Fixes, Documentation
    local config_file="changelog.config.cjs"
    if [ -f "$config_file" ]; then
        npx conventional-changelog -n "$config_file" -i CHANGELOG.md -s
    else
        npx conventional-changelog -p conventionalcommits -i CHANGELOG.md -s
    fi

    print_info "Changelog generated successfully in CHANGELOG.md"
}

# Function to create git tag
create_git_tag() {
    local version=$1
    git add CHANGELOG.md
    git add -A
    git commit -m "Release $version"
    git tag -a "v$version" -m "Release $version"
    print_info "Created git tag v$version"
}

# Main script logic
main() {
    print_info "Linkora-socials Release Script"
    print_info "=============================="
    
    # Check if we're in a git repository
    if ! git rev-parse --git-head > /dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
    
    # Check if working directory is clean
    if [ -n "$(git status --porcelain)" ]; then
        print_error "Working directory is not clean. Please commit or stash changes first."
        exit 1
    fi
    
    # Get current versions
    local current_contract_version=$(get_current_version)
    local current_root_version=$(get_root_version)
    
    print_info "Current contract version: $current_contract_version"
    print_info "Current root version: $current_root_version"
    
    # Check if versions are in sync
    if [ "$current_contract_version" != "$current_root_version" ]; then
        print_warning "Contract and root versions are not in sync"
    fi
    
    # Prompt for new version
    echo -n "Enter new version (current: $current_contract_version): "
    read new_version
    
    if [ -z "$new_version" ]; then
        print_error "Version cannot be empty"
        exit 1
    fi
    
    # Check if version is valid (basic semantic version check)
    if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid version format. Use semantic versioning (e.g., 0.1.0)"
        exit 1
    fi
    
    # Check if tag already exists
    if tag_exists "v$new_version"; then
        print_error "Tag v$new_version already exists"
        exit 1
    fi
    
    # Check if version is the same as current
    if [ "$new_version" = "$current_contract_version" ]; then
        print_error "New version is the same as current version"
        exit 1
    fi
    
    print_info "Preparing release $new_version"
    
    # Update versions
    update_contract_version "$new_version"
    update_root_version "$new_version"
    
    # Add changelog entry
    generate_changelog "$new_version"
    
    # Create git tag
    create_git_tag "$new_version"
    
    print_info "Release $new_version prepared successfully!"
    print_info "Next steps:"
    print_info "1. Review generated CHANGELOG.md and git diff"
    print_info "2. Push with: git push && git push --tags"
    print_info "3. Create a GitHub release from the tag"
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
