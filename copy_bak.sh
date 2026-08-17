#!/bin/bash
echo "Creating backup folder inside docuflow-db container..."
docker exec -u 0 docuflow-db mkdir -p /var/opt/mssql/backup
echo "Copying DocuFlowDB.bak into container..."
docker cp /opt/docflow/docuflow-automation/DocuFlowDB.bak docuflow-db:/var/opt/mssql/backup/
echo "Setting correct file permissions..."
docker exec -u 0 docuflow-db chown -R mssql:mssql /var/opt/mssql/backup
echo "Done! The file is now copied to /var/opt/mssql/backup/DocuFlowDB.bak inside the database container."
