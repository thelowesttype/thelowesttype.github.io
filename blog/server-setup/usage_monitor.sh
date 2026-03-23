#!/bin/bash

# System Monitor Script with Telert Notifications
# Description: Monitors CPU, Memory, Network, GPU, and Disk usage with cleanup capabilities

# Thresholds (in percentage)
CPU_THRESHOLD=80
MEMORY_THRESHOLD=80
NETWORK_THRESHOLD=80
DISK_THRESHOLD=80

# CPU Throttling Limit (in percentage)
THROTTLE_LIMIT=80

# Whitelisted Docker images and containers (space-separated)
WHITELISTED_IMAGES="download_tartan:single_thread download_tartan:latest visnav:tartan_processing visnav:training_rightsidedriving_daylight"
WHITELISTED_CONTAINERS="nginx-prod postgres-main"

# Lock file to prevent multiple instances
LOCK_FILE="/tmp/system_monitor.lock"

# Log file
LOG_FILE="/home/iris/maintainer-tools/logs/system_monitor.log"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to send telert notification
send_telert_notification() {
    local message="$1"
    local priority="${2:-normal}"
    
    if command_exists telert; then
        echo "$message" | telert send
        
        if [ $? -eq 0 ]; then
            log_message "Telert notification sent successfully"
        else
            log_message "Failed to send telert notification"
        fi
    else
        log_message "Error: telert command not found"
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get top processes by CPU
get_top_cpu_processes() {
    ps aux --sort=-%cpu | head -6 | tail -5 | awk '{printf "%s (PID: %s, User: %s) - %.1f%%\n", $11, $2, $1, $3}'
}

# Function to get top processes by memory
get_top_memory_processes() {
    ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf "%s (PID: %s, User: %s) - %.1f%%\n", $11, $2,$1,$4}'
}

# Function to monitor CPU usage
monitor_cpu() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    cpu_usage=${cpu_usage%.*}  # Remove decimal part
    
    if [ "$cpu_usage" -gt "$CPU_THRESHOLD" ]; then
        local message="HIGH CPU USAGE ALERT

Current CPU Usage: ${cpu_usage}%
Threshold: ${CPU_THRESHOLD}%
Server: $(hostname)
Time: $(date)

Top CPU Processes:
$(get_top_cpu_processes)"
        
        send_telert_notification "$message" "high"
        log_message "CPU usage alert sent: ${cpu_usage}%"

	if command_exists docker; then
            local top_container_info=$(docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}" | sort -rV -k2 | head -n 1)
            local top_container_name=$(echo "$top_container_info" | awk '{print $1}')
            local top_container_cpu=$(echo "$top_container_info" | awk '{print $2}' | sed 's/%//')
            top_container_cpu=${top_container_cpu%.*}

            if [ -n "$top_container_name" ] && [ "$top_container_cpu" -gt "$CPU_THRESHOLD" ]; then
                pids_to_throttle=$(docker top "$top_container_name" -o pid | awk 'NR>1 {print $1}')
                target_description="Docker container '$top_container_name'"
            fi
        fi

	if [ -z "$pids_to_throttle" ]; then
            local top_user=$(ps aux --sort=-%cpu | awk 'NR>1 {print $1; exit}')
            if [ "$top_user" != "root" ]; then
                pids_to_throttle=$(pgrep -u "$top_user")
                target_description="user '$top_user'"
            else
                log_message "High CPU usage by 'root' detected. Throttling skipped to prevent system issues."
                message="$message\n\nWARNING: High CPU by 'root'. Throttling skipped. Manual check needed."
                send_telert_notification "$message" "high"
                return
            fi
        fi
        
	if command_exists cpulimit; then
            if [ -n "$pids_to_throttle" ]; then
                message="
ATTEMPTING TO THROTTLE USER: $target_description
Limiting to ${THROTTLE_LIMIT}% CPU usage."

                log_message "High CPU usage detected. Attempting to throttle '$target_description' to ${THROTTLE_LIMIT}%."

                for pid in $pids_to_throttle; do
                    sudo cpulimit --pid $pid --limit $THROTTLE_LIMIT &
                    log_message "Applied cpulimit to PID $pid."
                done
                message="$message
THROTTLING INITIATED.
Processes for '$target_description' are now limited to ${THROTTLE_LIMIT}% of a core."
            else
                log_message "High CPU usage detected, but no processes found for user '$top_user' to throttle."
                message="$message
WARNING: High CPU usage detected, but could not identify processes for the top user '$top_user' to throttle."
            fi
        fi
	send_telert_notification "$message" "high"
    fi
}

# Function to monitor memory usage
monitor_memory() {
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    
    if [ "$memory_usage" -gt "$MEMORY_THRESHOLD" ]; then
        local message="HIGH MEMORY USAGE ALERT

Current Memory Usage: ${memory_usage}%
Threshold: ${MEMORY_THRESHOLD}%
Server: $(hostname)
Time: $(date)

Memory Details:
$(free -h | grep -E "Mem|Swap" | awk '{printf "%s: %s/%s (%s used)\n", $1, $3, $2, $5}')

Top Memory Processes:
$(get_top_memory_processes)"
        
        send_telert_notification "$message" "high"
        log_message "Memory usage alert sent: ${memory_usage}%"
    fi
}

# Function to monitor GPU usage
monitor_gpu() {
    if command_exists nvidia-smi; then
        local gpu_processes=$(nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader)
        
        if [ -n "$gpu_processes" ]; then
            local message="GPU USAGE DETECTED

Server: $(hostname)
Time: $(date)

GPU Status:
$(nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader | awk -F, '{printf "%s: %s%% GPU, %s/%s MB Memory\n", $1, $2, $3, $4}')

Active GPU Processes:"

            # Get process details with user information
            while IFS=',' read -r pid process_name used_memory; do
                local user=$(ps -o user= -p "$pid" 2>/dev/null || echo "unknown")
                message="$message
PID: $pid | Process: $process_name | User: $user | Memory: ${used_memory}MB"
            done <<< "$gpu_processes"
            
            send_telert_notification "$message" "normal"
            log_message "GPU usage notification sent"
        fi
    else
        log_message "nvidia-smi not available for GPU monitoring"
    fi
}

# Function to monitor disk usage
monitor_disk() {
    local scratch_usage=""
    local home_usage=""
    
    # Check /scratch if it exists
    if [ -d "/scratch" ]; then
        scratch_usage=$(df /scratch | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    fi
    
    # Check /home
    if [ -d "/home" ]; then
        home_usage=$(df /home | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    fi
    
    # Check if any partition exceeds threshold
    if [ -n "$scratch_usage" ] && [ "$scratch_usage" -gt "$DISK_THRESHOLD" ]; then
        send_disk_alert "/scratch" "$scratch_usage"
    fi
    
    if [ -n "$home_usage" ] && [ "$home_usage" -gt "$DISK_THRESHOLD" ]; then
        send_disk_alert "/home" "$home_usage"
    fi
}

# Function to send disk usage alert
send_disk_alert() {
    local partition="$1"
    local usage="$2"
    
    local message="HIGH DISK USAGE ALERT

Partition: $partition
Current Usage: ${usage}%
Threshold: ${DISK_THRESHOLD}%
Server: $(hostname)
Time: $(date)

Filesystem Information:
$(df -h | grep -E "Filesystem|$(df $partition | tail -1 | awk '{print $1}')")

Docker System Usage:
$(docker system df 2>/dev/null || echo "Docker not available")

Largest directories in $partition:
$(du -sh $partition/* 2>/dev/null | sort -hr | head -5 || echo "Unable to scan directories")

Run with --cleanup flag to start cleanup process"
    
    send_telert_notification "$message" "high"
    log_message "Disk usage alert sent for $partition: ${usage}%"
}

# Function to remove Docker build cache
cleanup_docker_build_cache() {
    log_message "starting docker build cache cleanup"
    
    if command_exists docker; then
        local cache_size_before=$(docker system df | grep "build cache" | awk '{print $4}')
        
        if [ -n "$cache_size_before" ] && [ "$cache_size_before" != "0b" ]; then
            docker builder prune -f
            local cache_size_after=$(docker system df | grep "build cache" | awk '{print $4}' || echo "0b")
            
            local message="docker build cache cleaned

server: $(hostname)
before: $cache_size_before
after: $cache_size_after
time: $(date)"
            
            send_telert_notification "$message" "normal"
            log_message "docker build cache cleaned: $cache_size_before -> $cache_size_after"
        else
            log_message "no docker build cache to clean"
        fi
    else
        log_message "docker not available for cleanup"
    fi
}

# function to remove exited docker containers
cleanup_exited_containers() {
    log_message "starting cleanup of exited docker containers"
    
    if command_exists docker; then
        local exited_containers=$(docker ps -a --filter "status=exited" --format "{{.id}} {{.names}}")
        
        if [ -n "$exited_containers" ]; then
            local containers_to_remove=""
            local containers_removed_count=0
            
            while ifs=' ' read -r container_id container_name; do
                if ! echo "$whitelisted_containers" | grep -q "$container_name"; then
                    containers_to_remove="$containers_to_remove $container_id"
                    containers_removed_count=$((containers_removed_count + 1))
                fi
            done <<< "$exited_containers"
            
            if [ -n "$containers_to_remove" ]; then
                docker rm $containers_to_remove
                local message="exited docker containers cleaned

server: $(hostname)
removed containers: $containers_removed_count
time: $(date)"
                
                send_telert_notification "$message" "normal"
                log_message "exited docker containers cleaned: $containers_removed_count"
            else
                log_message "no non-whitelisted exited containers to clean"
            fi
        else
            log_message "no exited docker containers found"
        fi
    else
        log_message "docker not available for cleanup"
    fi
}

# function to remove unused docker images
cleanup_unused_images() {
    log_message "starting cleanup of unused docker images"
    
    if command_exists docker; then
        local unused_images=$(docker images --filter "dangling=true" -q)
        local images_removed_count=0
        
        # remove dangling images first
        if [ -n "$unused_images" ]; then
            docker rmi $unused_images 2>/dev/null
            images_removed_count=$(echo "$unused_images" | wc -l)
            log_message "dangling docker images cleaned: $images_removed_count"
        fi
        
        # remove unused images (not whitelisted)
        local all_images=$(docker images --format "{{.repository}}:{{.tag}} {{.id}}")
        local additional_images_removed=0
        
        while ifs=' ' read -r image_name image_id; do
            if [ -n "$image_name" ] && [ -n "$image_id" ]; then
                if ! echo "$whitelisted_images" | grep -q "$image_name"; then
                    local containers_using_image=$(docker ps -a --filter "ancestor=$image_id" -q)
                    if [ -z "$containers_using_image" ]; then
                        if docker rmi "$image_id" 2>/dev/null; then
                            additional_images_removed=$((additional_images_removed + 1))
                        fi
                    fi
                fi
            fi
        done <<< "$all_images"
        
        local total_images_removed=$((images_removed_count + additional_images_removed))
        
        if [ "$total_images_removed" -gt 0 ]; then
            local message="unused docker images cleaned

server: $(hostname)
dangling images removed: $images_removed_count
unused images removed: $additional_images_removed
total images removed: $total_images_removed
time: $(date)

updated docker system usage:
$(docker system df)"
            
            send_telert_notification "$message" "normal"
            log_message "unused docker images cleaned: $total_images_removed"
        else
            log_message "no unused docker images to clean"
        fi
    else
        log_message "docker not available for cleanup"
    fi
}

# function to create lock file
create_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
            echo "Already running (PID: $pid)"
            exit 1
        fi
        rm -f "$LOCK_FILE"
    fi
    echo $$ > "$LOCK_FILE"
}


# function to remove lock file
remove_lock() {
    rm -f "$lock_file"
}

# function to handle cleanup on script exit
cleanup_on_exit() {
    remove_lock
    log_message "script execution completed"
}

# function to perform full cleanup with confirmations
perform_full_cleanup() {
    log_message "starting full cleanup process"
    
    # step 1: remove docker build cache
    echo "step 1: removing docker build cache..."
    cleanup_docker_build_cache
    
    echo "Press Enter to continue with Step 2 (Remove exited containers) or Ctrl+C to abort..."
    read -r
    
    # Step 2: Remove exited containers
    echo "Step 2: Removing exited Docker containers..."
    cleanup_exited_containers
    
    echo "Press Enter to continue with Step 3 (Remove unused images) or Ctrl+C to abort..."
    read -r
    
    # Step 3: Remove unused images
    echo "Step 3: Removing unused Docker images..."
    cleanup_unused_images
    
    local message="Cleanup Process Completed

Server: $(hostname)
Time: $(date)

Final System Status:
$(df -h | grep -E "Filesystem|/scratch|/home")

Docker System Usage:
$(docker system df 2>/dev/null || echo "Docker not available")"
    
    send_telert_notification "$message" "normal"
    log_message "Full cleanup process completed"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "OPTIONS:"
    echo "  --cleanup                 Start interactive cleanup process"
    echo "  --cleanup-step STEP       Execute specific cleanup step"
    echo "  --cleanup-auto            Execute all cleanup steps automatically"
    echo "  --help                    Show this help message"
    echo ""
    echo "CLEANUP STEPS:"
    echo "  build-cache              Remove Docker build cache"
    echo "  exited-containers        Remove exited Docker containers"
    echo "  unused-images            Remove unused Docker images"
}

# Main function
main() {
    # Parse command line arguments
    case "${1:-}" in
        --cleanup)
            create_lock
            trap cleanup_on_exit EXIT
            perform_full_cleanup
            exit 0
            ;;
        --cleanup-step)
            if [ -z "$2" ]; then
                echo "Error: Please specify a cleanup step"
                show_usage
                exit 1
            fi
            create_lock
            trap cleanup_on_exit EXIT
            case "$2" in
                build-cache)
                    cleanup_docker_build_cache
                    ;;
                exited-containers)
                    cleanup_exited_containers
                    ;;
                unused-images)
                    cleanup_unused_images
                    ;;
                *)
                    echo "Error: Unknown cleanup step '$2'"
                    show_usage
                    exit 1
                    ;;
            esac
            exit 0
            ;;
        --cleanup-auto)
            create_lock
            trap cleanup_on_exit EXIT
            log_message "Starting automatic cleanup process"
            cleanup_docker_build_cache
            cleanup_exited_containers
            cleanup_unused_images
            send_telert_notification "Automatic cleanup completed on $(hostname)" "normal"
            exit 0
            ;;
        --help)
            show_usage
            exit 0
            ;;
        "")
            # Normal monitoring mode
            ;;
        *)
            echo "Error: Unknown option '$1'"
            show_usage
            exit 1
            ;;
    esac
    
    log_message "Starting system monitoring script"
    
    # Create lock file
    create_lock
    
    # Set trap to cleanup on exit
    trap cleanup_on_exit EXIT
    
    # Run monitoring functions
    monitor_cpu
    monitor_memory
    monitor_gpu
    monitor_disk
    
    log_message "System monitoring completed successfully"
}

# Run the main function with all arguments
main "$@"
