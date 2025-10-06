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

There are fifty users, all blessed with root access, and the hard drive is so full that the desktop won’t even load. That’s when it hits you — the reality of what you’ve just inherited.

You’re not just getting a server; you’re inheriting years of chaos. You’ll need new hard drives, a proper user management system, and—let’s face it—you’ll probably end up writing half the management software yourself. Because who else will?

After fixing the same problems approximately 472 times, I decided it was time to automate the pain. Hence, this lovingly chaotic survival manual for the Server Maintenance — a place where Docker reigns supreme and ``/scratch`` is your only true home.

> In theory, automation saves time. In practice, it just breaks faster while you’re asleep.
>
*- 2AM me*

## The Server in Its Current Form
Let’s start with what the server actually is today. It’s a GPU-powered workspace for robotics, vision, and AI research. Everyone gets their own sandbox, isolation via Docker, and shared resources when needed.

The key services running include:
- **Docker** – The heart of everything. All user workloads run here.
- **NVIDIA Container Toolkit** – GPU passthrough support so your PyTorch models don’t cry.
- **Telert** – Powers discord alert and notification system.
- **Prometheus + Grafana (planned)** – For proper monitoring, once I stop duct-taping scripts together.
- **Custom maintenance scripts** – Bash automation for user creation, cleanup, and resource tracking.
- **Crontior** - To keep track of the maintenance scripts

Storage lives under ``/scratch/``, managed via LVM, so we can expand capacity when someone inevitably drops a 500GB dataset in the wrong place.

Each user has:
- A personal ``/scratch/<username>`` directory
- Access to GPUs via Docker.
- A shared ``/scratch/common`` space for collaborative data
- And, ideally, no root access (anymore)

## The Usage SoP (Standard Operating Procedure)

Every user runs their workloads only through Docker containers. That’s non-negotiable — partly for security, partly because that’s the only way the server stays sane.

The basic workflow is:

Log in via SSH.

1. Use your personal directory under ``/scratch/<username>``.
2. Launch your environment using Docker (custom image or base image). [Sample Dockerfile](/blog/server-setup/Dockerfile.txt)
3. Save all outputs back into your scratch space.
4. Clean up after yourself.

There’s also a shared etiquette:

- ``/scratch/common`` is not your personal archive. Use it for temporary sharing.

- GPU usage is monitored — so don’t hog them. Ideally would have loved the server to be running SLURM but for a 1 GPU system felt like overkill at that time.

- Old containers and images are purged automatically. Don’t panic when they disappear.

In short: use the server like a polite houseguest. Leave it cleaner than you found it (Sadly not everyone will do that. And hence you need to have enforcers too!)

## The Initial Setup: From Chaos to Functionality

When I first got the server, the plan was simple — wipe as little as possible and make it functional again. Of course, nothing is ever simple.

Here’s what had to happen:

1. **User Reset** – Everyone’s root access was revoked. Users were re-created with isolated directories and no shared home space.

2. **Storage Reconfiguration **– Added new hard drives, built an LVM volume group, and remounted ``/scratch``. This let us expand seamlessly later.

3. **Docker and GPU Setup** – Installed Docker, NVIDIA drivers, and container toolkit for GPU passthrough.

4. **Access Policy** – Created user management scripts that auto-generate credentials and add users to the docker group.

5. **Basic Monitoring**– Wrote lightweight bash scripts for GPU/CPU/memory tracking. These run via cron every 15–30 minutes.

6. **Cleanup Automation** – Weekly Docker pruning and monthly log cleanup to prevent slow disk death.

All this got us from “boot loop purgatory” to a stable, multi-user compute environment that doesn’t immediately catch fire when someone runs ``pip install torch``.

## The Maintainer Toolkit: Teaching the Server to Look After Itself

Once the server reached a somewhat stable state, I realized there was no going back — maintenance wasn’t a one-time thing. I needed to build tools that could manage users, track usage, and keep resources under control without my constant intervention. Cron jobs keep these scripts running on schedule. The system self-cleans, self-monitors, and even self-notifies. It’s not AI, but it’s the closest thing to an obedient intern I’ve ever built.

## create_user.sh

Set up a new user environment safely and consistently.

### Main tasks:

- Creates a new system user and assigns a secure initial password.
- Adds the user to necessary groups.
- Sets up a clean workspace directory under /scratch/<username> or a similar path.
- Copies default environment/config files (like .bashrc, .profile, etc.) from a template or maintainer account.
- Ensures ownership and permissions are correct (chown -R username:username on workspace).
- Sends setup information (username, password, workspace path) to the user on his/her email-id.

[Get the script](/blog/server-setup/create_user.sh)

## delete_user.sh
Safely remove a user from the system and handle their workspace either by saving it to a backup area or deleting it.

### Main tasks:

- Confirms the action to avoid accidental deletion.
- Either backs up the user’s workspace to /scratch/user_backups (default) or deletes it completely.
- Changes ownership and permissions of the backup to the root maintainer (iris).
- Stops all user processes, removes the user from the docker group, and deletes the system account.
- Ensures clean removal even if some steps fail (tries alternative deletion methods).

[Get the script](/blog/server-setup/delete_user.sh)

## usage_monitor.sh
Automated system resource monitor and docker cleaner. This is the enforcer to ensure everyone abides by the rules!!

### Main tasks:

- Monitors CPU, memory, GPU, and disk usage against configurable thresholds.
- Sends notifications (via Telert) when resource usage is high.
- Automatically throttles runaway CPU processes.
- Cleans up docker build cache, stopped containers, and unused images (with whitelist protection).
- Can be run manually, automatically (--cleanup-auto), or interactively.
- Maintains a lock to prevent multiple runs and logs all actions.
- Deletes oldest and largest files from the scratch workspace, after giving warning on discord channel. Rationale here is that the server is for computation and not for long term storage. Users are adviced to use NAS to store files for longterm when needed.

[Get the script](/blog/server-setup/usage_monitor.sh)

## The Pain Points and the Lessons

- Every setup has scars. Here are a few from mine:

- Storage growth is relentless. No matter how much space you add, someone will fill it with raw data dumps.

- Monitoring is a full-time job. Without automation, you’ll never catch overuse in time.

- Automation saves your sanity. Anything you can script, you must. Otherwise, you’ll repeat the same fix every week.

- Root access ruins everything. It took one afternoon to revoke and three days to recover from what others had done.

Maintaining a shared server is less about tech and more about discipline. The moment you let things slide, entropy wins.

## The Moral of the Story

I never planned to become a sysadmin. I just wanted a stable compute setup for robotics work. But when you inherit a half-broken machine full of mystery users and full disks, you learn fast.

Now, with automation in place, the server mostly runs itself (even after I left the lab). I finally have time to get back to robotics — though part of me secretly enjoys watching the maintenance logs scroll by at 2 AM, knowing it’s all working by itself.

<br>

*Also fun-fact you can subscribe to the blog using RSS! For Firefox users you can use [Livemark](https://addons.mozilla.org/en-US/firefox/addon/livemarks/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search) for this.*

<span style="color:green">$</span> press <kbd>CTRL</kbd>+<kbd>W</kbd> to end the session.
