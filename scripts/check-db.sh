#!/bin/bash
# Check running containers
sudo docker ps | grep supabase

# Check container name
sudo docker ps --format "{{.Names}}" | grep -i postgres
