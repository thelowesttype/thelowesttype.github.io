#!/bin/bash

# User Creation and Directory Setup Script
# This script creates a new user and sets up a directory with specified permissions

set -e  # Exit on any error

usage() {
    echo "Usage: $0 <username> <email> [directory_path]"
    echo "  username: Name of the user to create"
    echo "  email: Email address to send access details"
    echo "  directory_path: Optional. Path for user's directory (default: /scratch/username)"
    echo ""
    echo "Example: $0 john john@example.com /opt/john_workspace"
    echo "Example: $0 alice alice@example.com"
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo "Error: This script must be run as root (use sudo)"
        exit 1
    fi
}

send_access_email() {
    local username="$1"
    local user_email="$2"

    # Validate inputs
    if [[ -z "$username" || -z "$user_email" ]]; then
        echo "Error: Username and email are required"
        echo "Usage: send_access_email <username> <email>"
        return 1
    fi

    # Email configuration (modify these variables as needed)
    local SERVER_IP="10.40.29.169"
    local DEFAULT_PASSWORD="airl"
    local BASE_DIR="/scratch"
    local SUBJECT="A6K ArtPark Server Access - Account Setup Complete"

    # Create email body
    local EMAIL_BODY=$(cat << EOF
Hi $username,

Your account has been created on the A6K ArtPark server. Here are your access details:

Connection Details:
• Server: $username@$SERVER_IP
• Default Password: $DEFAULT_PASSWORD
• Working Directory: $BASE_DIR/$username (please use this as your main workspace)

Important Usage Guidelines:
• All computational work must be performed via Docker containers
• Running processes natively on the server is strictly prohibited
• Please change your default password upon first login

Discord Access:
If you haven't been added to the AIRL Discord channel (https://discord.gg/ynhVgJcm) #gpu-cluster-status, please let me know so I can grant you access.

Next Steps:
1. SSH into the server using the provided credentials
2. Change your default password immediately
3. Navigate to $BASE_DIR/$username for your work
4. Set up your Docker environment for computations

Feel free to reach out if you encounter any issues or have questions about the setup.

--
GPU goes burrr
Iris

Account created on: $(date '+%Y-%m-%d %H:%M:%S')
EOF
)

    echo "Attempting to send access email to $user_email..."

    # Method 1: Using mail command (if available)
    if command -v mail &> /dev/null; then
        echo "$EMAIL_BODY" | mail -s "$SUBJECT" "$user_email"
        echo "Email sent to $user_email using mail command"
        return 0
    fi

}

create_user() {
    local username=$1
    
    # Check if user already exists
    if id "$username" &>/dev/null; then
        echo "Warning: User '$username' already exists"
        return 0
    fi
    
    echo "Creating user: $username"
    
    # Create user with home directory
    if useradd -m -s /bin/bash "$username"; then
        echo "User '$username' created successfully"
        
        # Set initial password (user will be prompted to change on first login)
        echo "Setting temporary password for $username"
        echo "$username:airl" | chpasswd
        
        # Force password change on first login
        chage -d 0 "$username"
        
        echo "Temporary password set (airl). User will be required to change password on first login."
        echo "Adding user to docker group..."
        if usermod -aG docker "$username"; then
            echo "User '$username' added to docker group successfully"
        else
            echo "Warning: Failed to add user to docker group (docker might not be installed)"
        fi
    else
        echo "Error: Failed to create user '$username'"
        exit 1
    fi
}

# Function to create directory with specified permissions
create_user_directory() {
    local username=$1
    local dir_path=$2
    
    echo "Creating directory: $dir_path"
    
    if mkdir -p "$dir_path"; then
        echo "Directory '$dir_path' created successfully"
    else
        echo "Error: Failed to create directory '$dir_path'"
        exit 1
    fi
    
    if chown "$username:$username" "$dir_path"; then
        echo "Ownership set to $username:$username"
    else
        echo "Error: Failed to set ownership"
        exit 1
    fi
    
    if chmod 700 "$dir_path"; then
        echo "Permissions set to drwx------ (700)"
    else
        echo "Error: Failed to set permissions"
        exit 1
    fi
    
    echo "Directory details:"
    ls -ld "$dir_path"
}

main() {
    # Check if at least username and email are provided
    if [[ $# -lt 2 ]]; then
        usage
    fi
    
    local username=$1
    local user_email=$2
    local directory_path
    
    if [[ $# -ge 3 ]]; then
        directory_path=$3
    else
        directory_path="/scratch/$username"
    fi
    
    # Validate username format
    if [[ ! "$username" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
        echo "Error: Invalid username format. Username should start with lowercase letter or underscore,"
        echo "       and contain only lowercase letters, numbers, underscores, or hyphens."
        exit 1
    fi
    
    # Basic email validation
    if [[ ! "$user_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        echo "Error: Invalid email format"
        exit 1
    fi
    
    echo "================================"
    echo "User Creation and Setup Script"
    echo "================================"
    echo "Username: $username"
    echo "Email: $user_email"
    echo "Directory: $directory_path"
    echo "Permissions: drwx------ (700)"
    echo ""
    
    # Check if running as root
    check_root
    
    # Create the user
    create_user "$username"
    
    # Create the directory with specified permissions
    create_user_directory "$username" "$directory_path"
    
    # Send access email
    echo ""
    echo "================================"
    echo "Sending Access Email"
    echo "================================"
    send_access_email "$username" "$user_email"
}

# Run the main function with all arguments
main "$@"
