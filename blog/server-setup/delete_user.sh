#!/bin/bash

# User Removal and Workspace Management Script
# This script removes a user and handles workspace directory (save or delete)

set -e  # Exit on any error

# Configuration
ROOT_USER="iris"
BACKUP_BASE_DIR="/scratch/user_backups"

usage() {
    echo "Usage: $0 <username> [workspace_path] [--save|--delete]"
    echo ""
    echo "Arguments:"
    echo "  username        : Name of the user to remove"
    echo "  workspace_path  : Optional. Path to user's workspace directory"
    echo "                   (default: /home/username/workspace)"
    echo "  --save          : Save the workspace directory (default behavior)"
    echo "  --delete        : Delete the workspace directory permanently"
    echo ""
    echo "Examples:"
    echo "  $0 john --delete                    # Remove user john and delete workspace"
    echo "  $0 alice --save                     # Remove user alice and save workspace"
    echo "  $0 bob /opt/bob_workspace --save    # Remove user bob and save custom workspace"
    echo "  $0 charlie                          # Remove user charlie and save workspace (default)"
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo "Error: This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to check if root user 'iris' exists
check_iris_user() {
    if ! id "$ROOT_USER" &>/dev/null; then
        echo "Error: Root user '$ROOT_USER' does not exist on this system"
        echo "Please ensure the root user '$ROOT_USER' exists before running this script"
        exit 1
    fi
}

# Function to validate user exists
validate_user() {
    local username=$1
    
    if ! id "$username" &>/dev/null; then
        echo "Error: User '$username' does not exist"
        exit 1
    fi
}

# Function to save workspace directory
save_workspace() {
    local username=$1
    local workspace_path=$2
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_dir="$BACKUP_BASE_DIR/${username}_${timestamp}"
    
    echo "Saving workspace directory..."
    
    # Check if workspace directory exists
    if [[ ! -d "$workspace_path" ]]; then
        echo "Warning: Workspace directory '$workspace_path' does not exist"
        return 0
    fi
    
    # Create backup base directory if it doesn't exist
    if ! mkdir -p "$BACKUP_BASE_DIR"; then
        echo "Error: Failed to create backup directory '$BACKUP_BASE_DIR'"
        exit 1
    fi
    
    # Copy the workspace to backup location
    if cp -r "$workspace_path" "$backup_dir"; then
        echo "Workspace copied successfully to: $backup_dir"
    else
        echo "Error: Failed to copy workspace directory"
        exit 1
    fi
    
    # Change ownership to root user 'iris'
    if chown -R "$ROOT_USER:$ROOT_USER" "$backup_dir"; then
        echo "Ownership changed successfully"
    else
        echo "Error: Failed to change ownership"
        exit 1
    fi
    
    if chmod -R 700 "$backup_dir"; then
        echo "Permissions set successfully"
    else
        echo "Error: Failed to set permissions"
        exit 1
    fi
    
    # Create a metadata file with backup information
    local metadata_file="$backup_dir/backup_metadata.txt"
    cat > "$metadata_file" << EOF
Backup Information
==================
Original User: $username
Original Path: $workspace_path
Backup Date: $(date)
Backup Location: $backup_dir
Backed up by: $(whoami)
Server: $(hostname)

Notes:
- This directory contains the workspace of user '$username'
- Permissions set to 700 (visible only to $ROOT_USER)
- Original workspace was removed during user deletion
EOF
    
    echo "Metadata file created: $metadata_file"
    echo "Backup completed successfully!"
    
    # Display final permissions
    echo ""
    echo "Backup directory details:"
    ls -ld "$backup_dir"
}

# Function to delete workspace directory
delete_workspace() {
    local workspace_path=$1
    
    echo "Deleting workspace directory..."
    
    if [[ ! -d "$workspace_path" ]]; then
        echo "Warning: Workspace directory '$workspace_path' does not exist"
        return 0
    fi
    echo "WARNING: About to permanently delete '$workspace_path'"
    read -p "Are you sure you want to continue? (yes/no): " confirmation
    if [[ "$confirmation" != "yes" ]]; then
        echo "Deletion cancelled by user"
        exit 0
    fi
    if rm -rf "$workspace_path"; then
        echo "Workspace directory '$workspace_path' deleted successfully"
    else
        echo "Error: Failed to delete workspace directory"
        exit 1
    fi
}

remove_user() {
    local username=$1
    
    echo "Removing user: $username"
    
    echo "Terminating all processes owned by $username..."
    pkill -9 -u "$username" 2>/dev/null || echo "No processes found for user $username"
    sleep 2

    echo "Removing user from docker group..."
    if gpasswd -d "$username" docker 2>/dev/null; then
        echo "User '$username' removed from docker group"
    else
        echo "User was not in docker group or docker group doesn't exist"
    fi  

    if userdel -r "$username" 2>/dev/null; then
        echo "User '$username' and home directory removed successfully"
    else
        echo "Attempting alternative user removal..."
        if userdel "$username" 2>/dev/null; then
            echo "User '$username' removed (home directory may still exist)"
            local home_dir="/home/$username"
            if [[ -d "$home_dir" ]]; then
                rm -rf "$home_dir"
                echo "Home directory '$home_dir' removed manually"
            fi
        else
            echo "Error: Failed to remove user '$username'"
            exit 1
        fi
    fi
}

main() {
    local username=""
    local workspace_path=""
    local action="save"  # Default action is to save
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --save)
                action="save"
                shift
                ;;
            --delete)
                action="delete"
                shift
                ;;
            -*)
                echo "Error: Unknown option $1"
                usage
                ;;
            *)
                if [[ -z "$username" ]]; then
                    username=$1
                elif [[ -z "$workspace_path" ]]; then
                    workspace_path=$1
                else
                    echo "Error: Too many arguments"
                    usage
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$username" ]]; then
        usage
    fi
    
    if [[ -z "$workspace_path" ]]; then
        workspace_path="/scratch/$username"
    fi
    
    echo "================================"
    echo "User Removal Script"
    echo "================================"
    echo "Target User: $username"
    echo "Workspace Path: $workspace_path"
    echo "Action: $action workspace"
    echo "Root User: $ROOT_USER"
    echo ""
    
    # Perform checks
    check_root
    check_iris_user
    validate_user "$username"
    
    # Confirm the operation
    echo "WARNING: This will permanently remove user '$username' from the system!"
    if [[ "$action" == "delete" ]]; then
        echo "WARNING: The workspace directory will be PERMANENTLY DELETED!"
    else
        echo "INFO: The workspace directory will be saved and secured for root user '$ROOT_USER'"
    fi
    echo ""
    read -p "Do you want to continue? (yes/no): " final_confirmation
    
    if [[ "$final_confirmation" != "yes" ]]; then
        echo "Operation cancelled by user"
        exit 0
    fi
    
    if [[ "$action" == "save" ]]; then
        save_workspace "$username" "$workspace_path"
    else
        delete_workspace "$workspace_path"
    fi
    
    remove_user "$username"
}

# Run the main function with all arguments
main "$@"
