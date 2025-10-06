+++
title = "Server-Shenanigans"
description = "Accidentally becoming a sysadmin and lived to tell the tale"
date = 2025-10-03T07:09:00Z
updated = 2025-10-03T07:09:00Z
draft = false
template = "blog/page.html"

[taxonomies]
authors = ["Saksham"]

[extra]
lead = 'Accidentally becoming a sysadmin and lived to tell the tale'
math = true
+++

<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/server-setup/car-and-server.jpg" class="center"></img>
        <figcaption>Guess which costs more the vehicle or the server?</figcaption>
    </figure>
</div>

<br>

So picture this: you recently "borrowed" a shiny new server from another lab — full of optimism, sunshine, and rainbows. You plug it in, power it up… and the happiness evaporates instantly.

There are fifty users, all blessed with root access, and the hard drive is so full that the desktop won't even load. That's when it hits you — the reality of what you've just inherited.

You're not just getting a server; you're inheriting years of chaos. You'll need new hard drives, a proper user management system, and—let's face it—you'll probably end up writing half the management software yourself. Because who else will?

After fixing the same problems approximately 472 times, I decided it was time to automate the pain. Hence, this lovingly chaotic survival manual for Server Maintenance — a place where Docker reigns supreme and `/scratch` is your only true home.

> In theory, automation saves time. In practice, it just breaks faster while you're asleep.
>
> *- 2AM me*

## The Server in Its Current Form

Let's start with what the server actually is today. It's a GPU-powered workspace for robotics, vision, and AI research. Everyone gets their own sandbox, isolation via Docker, and shared resources when needed.

The key services running include:

- **Docker** – The heart of everything. All user workloads run here.
- **NVIDIA Container Toolkit** – GPU passthrough support so your PyTorch models don't cry.
- **Telert** – Powers discord alert and notification system.
- **Prometheus + Grafana (planned)** – For proper monitoring, once I stop duct-taping scripts together.
- **Custom maintenance scripts** – Bash automation for user creation, cleanup, and resource tracking.
- **Cronitor** - To keep track of the maintenance scripts

Storage lives under `/scratch/`, managed via LVM, so we can expand capacity when someone inevitably drops a 500GB dataset in the wrong place.

Each user has:

- A personal `/scratch/<username>` directory
- Access to GPUs via Docker
- A shared `/scratch/common` space for collaborative data
- And, ideally, no root access (anymore)

## The Usage SOP (Standard Operating Procedure)

Every user runs their workloads only through Docker containers. That's non-negotiable — partly for security, partly because that's the only way the server stays sane.

The basic workflow is:

1. Log in via SSH: `ssh username@10.40.29.169`
2. Navigate to your personal directory: `cd /scratch/<username>`
3. Launch your environment using Docker (custom image or base image). [Sample Dockerfile](/blog/server-setup/Dockerfile.txt)
4. Save all outputs back into your scratch space
5. Clean up after yourself

### Common Docker Commands You'll Actually Use

```bash
# Check what's running (and by whom)
docker ps -a

# Launch a container with GPU access
docker run --gpus all -it -v /scratch/$USER:/workspace your-image:tag

# Build your custom image
docker build -t your-image:tag .

# Check GPU availability
nvidia-smi

# Monitor GPU usage continuously
watch -n 1 nvidia-smi

# Kill your container when done
docker stop <container-id>
docker rm <container-id>
```

There's also a shared etiquette:

- `/scratch/common` is not your personal archive. Use it for temporary sharing.
- GPU usage is monitored — so don't hog them. Ideally would have loved the server to be running SLURM but for a 1 GPU system felt like overkill at that time.
- Old containers and images are purged automatically. Don't panic when they disappear.

In short: use the server like a polite houseguest. Leave it cleaner than you found it (Sadly not everyone will do that. And hence you need enforcers too!)

## The Initial Setup: From Chaos to Functionality

When I first got the server, the plan was simple — wipe as little as possible and make it functional again. Of course, nothing is ever simple.

### Phase 1: Storage Salvation with LVM

The existing drives were a mess, and we needed expandability. LVM (Logical Volume Management) was the answer.

```bash
# First, identify your new disk
sudo fdisk -l
lsblk

# Create a physical volume
sudo pvcreate /dev/sdX1

# Either create a new volume group or extend existing
sudo vgcreate vgcodepool /dev/sdX1    # New VG
# OR
sudo vgextend vgcodepool /dev/sdX1    # Add to existing

# Create/extend logical volume
sudo lvcreate -L 1500G -n scratch vgcodepool
# OR
sudo lvextend -l +100%FREE /dev/vgcodepool/scratch

# Format and resize
sudo mkfs.ext3 /dev/vgcodepool/scratch
sudo resize2fs /dev/vgcodepool/scratch

# Mount it
sudo mount -t ext3 /dev/vgcodepool/scratch /scratch
```

To make it permanent, I added this to `/etc/fstab`:

```bash
UUID=<your-uuid> /scratch ext3 defaults 0 2
```

The beauty of LVM? When someone inevitably fills the disk again, I just add another drive, extend the volume, and resize the filesystem. No downtime, no data migration.

### Phase 2: User Management Overhaul

Everyone's root access was revoked. Users were re-created with isolated directories and proper permissions. I wrote two scripts that became my best friends — and eventually, the backbone of the entire user management system.

The `create_user.sh` script handles everything from account creation to sending welcome emails. The `delete_user.sh` script ensures safe removal with optional workspace backup. These aren't just convenience tools — they enforce consistency and security that manual management could never guarantee.

(See [The Maintainer Toolkit](#the-maintainer-toolkit-teaching-the-server-to-look-after-itself) section below for detailed breakdown of how these scripts work.)

### Phase 3: Docker and GPU Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Test it
docker run --rm --gpus all ubuntu nvidia-smi
```

I also moved Docker's root directory to avoid filling up the system partition:

```bash
# Stop everything
sudo systemctl stop docker docker.socket containerd

# Move the data
sudo mv /var/lib/docker /home/docker_root/

# Update /etc/docker/daemon.json
{
  "data-root": "/home/docker_root",
  "runtimes": {
    "nvidia": {
      "path": "nvidia-container-runtime",
      "runtimeArgs": []
    }
  }
}

# Restart and verify
sudo systemctl start docker
docker info | grep "Docker Root Dir"
```

## The Maintainer Toolkit: Teaching the Server to Look After Itself

Once the server reached a somewhat stable state, I realized there was no going back — maintenance wasn't a one-time thing. I needed to build tools that could manage users, track usage, and keep resources under control without my constant intervention.

### create_user.sh — The Onboarding Wizard

This script is my answer to "can you give me access to the server?" Instead of manually creating users, setting up directories, configuring permissions, and sending welcome emails, I now just run one command.

**Basic usage:**

```bash
sudo ./create_user.sh stopthepain stopthepain@iisc.ac.in
sudo ./create_user.sh john john@example.com /scratch/john_custom
```

**What happens under the hood:**

1. **Validation first** — Checks if the script is run as root, validates username format (lowercase, starts with letter/underscore), and verifies email format. Because the last thing you want is a user named "admin@123" breaking your system.

2. **User creation with security baked in:**
   ```bash
   useradd -m -s /bin/bash username
   echo "username:airl" | chpasswd
   chage -d 0 username  # Forces password change on first login
   usermod -aG docker username
   ```
   The temporary password `airl` was chosen because it's memorable but meaningless. Users can't avoid changing it — the system forces them to on first SSH login.

3. **Workspace setup with proper isolation:**
   ```bash
   mkdir -p /scratch/username
   chown username:username /scratch/username
   chmod 700 /scratch/username  # Only the user can access their space
   ```
   The 700 permissions are critical. Nobody else can peek into your directory, not even other users. Privacy by default.

4. **Automated email notification** — The script sends a complete onboarding email with:
   - SSH connection details
   - Temporary password (with explicit instructions to change it)
   - Workspace location
   - Usage guidelines (Docker-only policy)
   - Discord channel link for support

   The email template is built right into the script, so you can customize it for your lab's specific needs. Mine includes a "GPU goes burrr" signature because why not.

**Why this matters:** Before this script, user onboarding took 15-20 minutes of manual work. Now it's a single command and 30 seconds. More importantly, it's consistent — every user gets the same secure setup, no exceptions, no forgotten steps.

### delete_user.sh — The Responsible Bouncer

Removing users is trickier than creating them. You can't just run `userdel` and call it a day — what about their data? Their running processes? Their Docker containers?

**Usage patterns:**

```bash
# Safe removal (default) - saves workspace
sudo ./delete_user.sh stopthepain

# Full removal - deletes everything
sudo ./delete_user.sh stopthepain --delete

# Custom workspace path
sudo ./delete_user.sh john /scratch/john_custom --save
```

**The deletion workflow:**

1. **Validation and confirmation** — Checks if user exists, verifies root access, and asks for explicit "yes" confirmation. No accidental deletions allowed.

2. **Process termination:**
   ```bash
   pkill -9 -u username
   sleep 2  # Give processes time to actually die
   ```
   Kills all running processes owned by the user. The sleep is important — some processes are stubborn and need a moment to realize they're dead.

3. **Docker group cleanup:**
   ```bash
   gpasswd -d username docker
   ```
   Removes Docker access before deletion. Otherwise, the user's containers might become orphaned.

4. **Workspace handling — The critical decision:**

   **Option A: Save the workspace (default and recommended)**
   ```bash
   timestamp=$(date +"%Y%m%d_%H%M%S")
   backup_dir="/scratch/user_backups/${username}_${timestamp}"
   cp -r /scratch/username $backup_dir
   chown -R iris:iris $backup_dir
   chmod -R 700 $backup_dir
   ```

   The script copies the entire workspace to `/scratch/user_backups/username_timestamp/`, changes ownership to the maintainer account (`iris`), and locks down permissions. It also creates a metadata file with:
   - Original username and path
   - Backup timestamp
   - Server hostname
   - Reason for backup

   This is the safe option. Maybe the user left important results behind. Maybe they're coming back. Maybe you just don't want to be responsible for deleting someone's PhD thesis.

   **Option B: Delete the workspace (use with caution)**
   ```bash
   rm -rf /scratch/username
   ```

   Permanent deletion. The script asks for confirmation twice — once at the start, once before actually nuking the directory. I've seen too many "wait, I needed that" moments to skip the double-check.

5. **User account removal:**
   ```bash
   userdel -r username  # Remove user and home directory
   ```

   If this fails (sometimes it does), the script falls back to `userdel username` followed by manual home directory cleanup. Always have a Plan B.

**Real-world usage patterns:**

- **Temporary collaborator leaving:** `--save` (default). Their data might be useful later, and storage is cheaper than regret.

- **User explicitly requested deletion:** `--delete` after confirming they've backed up everything they need.

- **Cleaning up after a workshop:** `--delete` for temporary accounts that were only used for demos.

**The backup structure looks like this:**
```
/scratch/user_backups/
├── stopthepain_20241015_143022/
│   ├── backup_metadata.txt
│   ├── datasets/
│   ├── models/
│   └── results/
└── john_20241018_091533/
    ├── backup_metadata.txt
    └── project_files/
```

Every backup is timestamped, documented, and owned by the maintainer. If someone comes back six months later asking "where's my data?", you can actually find it.

### usage_monitor.sh — The Enforcer

This script runs every 15 minutes via cron and is responsible for keeping the server sane. It monitors everything, throttles misbehaving processes, and cleans up Docker waste.

```bash
# Manual run (see what's happening)
./usage_monitor.sh

# Interactive cleanup
./usage_monitor.sh --cleanup

# Automatic cleanup (no questions asked)
./usage_monitor.sh --cleanup-auto

# Specific cleanup steps
./usage_monitor.sh --cleanup-step build-cache
./usage_monitor.sh --cleanup-step exited-containers
./usage_monitor.sh --cleanup-step unused-images
```

**What it monitors:**

- CPU usage (threshold: 80%)
- Memory usage (threshold: 80%)
- Disk usage (threshold: 80%)
- GPU usage

**What it does when thresholds are breached:**

- Sends notifications via Telert
- Throttles CPU-hogging processes
- Starts cleanup procedures if disk is full
- Deletes oldest and largest files from `/scratch` (after warnings on Discord)

**Docker cleanup priorities:**

1. Build cache
2. Stopped/exited containers
3. Unused images (except whitelisted ones)
4. Dangling volumes

The whitelist protects critical images from auto-deletion. You can customize it in the script.

### Scheduled Automation with Cron

```bash
crontab -e
```

My current setup:

```bash
# Resource monitoring every 15 minutes
*/15 * * * * /home/iris/maintainer-tools/usage_monitor.sh

# GPU monitoring every 30 minutes
*/30 * * * * /home/iris/maintainer-tools/gpu_monitor.sh

# Weekly automatic cleanup (Sunday 2 AM)
0 2 * * 0 /home/iris/maintainer-tools/usage_monitor.sh --cleanup-auto

# Monthly root partition cleanup (1st of month, 3 AM)
0 3 1 * * /home/iris/maintainer-tools/cleanUpRoot.sh
```

### Notification System with Telert

Setting up Telert was surprisingly painless:

```bash
pip install telert
telert init    # Follow prompts to connect your Telegram bot
```

Now, every script can send notifications:

```bash
echo "Disk usage critical: 95%" | telert send
telert "Weekly cleanup completed"
```

It's integrated into all monitoring scripts. When something breaks at 3 AM, I get a message. When cleanup finishes, I get a message. It's like having a server that actually talks back.

### Emergency Commands You'll Need

When things go sideways (and they will), here's your survival kit:

```bash
# Find what's eating disk space
sudo ncdu /scratch
sudo du -sh /scratch/* | sort -hr | head -10

# Find files larger than 500MB
sudo find /scratch -type f -size +500M -exec du -h {} \; | sort -hr

# Check Docker's disk usage
docker system df

# Nuclear option: clean everything Docker
docker system prune -a --volumes

# Kill all processes for a user
sudo pkill -9 -u username

# See who's using the GPU
sudo fuser -v /dev/nvidia*

# Check LVM space availability
sudo vgs
sudo pvs
df -h /scratch
```

## The Pain Points and the Lessons

Every setup has scars. Here are a few from mine:

**Storage growth is relentless.** No matter how much space you add, someone will fill it with raw data dumps. LVM was a lifesaver, but automation to delete old files became mandatory.

**Monitoring is a full-time job.** Without automation, you'll never catch overuse in time. The moment you stop watching, someone will spawn 50 containers and consume all the RAM.

**Automation saves your sanity.** Anything you can script, you must. Otherwise, you'll repeat the same fix every week. My monitoring scripts have saved me more weekend debugging sessions than I can count.

**Root access ruins everything.** It took one afternoon to revoke and three days to recover from what others had done. Never again.

**Documentation is for future you.** I wrote everything down, not for others, but because 2 AM me forgets what 2 PM me configured. This blog is partly that documentation.

## The Workflow in Practice

Here's what a typical day looks like now:

**Morning:** Check Discord notifications. See that usage_monitor flagged high disk usage last night and cleaned 50GB automatically. No intervention needed.

**Midday:** New lab member joins. Run `create_user.sh`, they get an email with credentials and instructions. They're up and running in 5 minutes.

**Evening:** Someone accidentally fills their directory with dataset copies. Monitoring script catches it, sends a warning, and if they don't clean up, automatically removes the oldest files after 24 hours.

**Night:** Weekly cleanup runs automatically. Docker cache cleared, old containers removed, logs rotated. I wake up to a notification that everything completed successfully.

The server mostly runs itself now. I finally have time to get back to robotics — though part of me secretly enjoys watching the maintenance logs scroll by at 2 AM, knowing it's all working by itself.

## Where to Find Everything

All the scripts mentioned here are available:

- [create_user.sh](/blog/server-setup/create_user.sh) — User creation automation with email notifications
- [delete_user.sh](/blog/server-setup/delete_user.sh) — Safe user removal with workspace backup options
- [usage_monitor.sh](/blog/server-setup/usage_monitor.sh) — The main enforcer for resource monitoring and cleanup
- [Sample Dockerfile](/blog/server-setup/Dockerfile.txt) — Template for users

The full technical documentation with every command, configuration file, and troubleshooting step lives in the maintainer guide. This blog is just the highlights and the philosophy behind it all.

---

I never planned to become a sysadmin. I just wanted a stable compute setup for robotics work. But when you inherit a half-broken machine full of mystery users and full disks, you learn fast. Now, with automation in place, the server mostly runs itself (even after I left the lab).

<br>

<span style="color:green">$</span> press <kbd>CTRL</kbd>+<kbd>W</kbd> to end the session.
