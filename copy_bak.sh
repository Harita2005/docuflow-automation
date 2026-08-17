#!/bin/bash
echo "Copying DocuFlowDB.bak directly into the mssql/data folder..."
docker cp /opt/docflow/docuflow-automation/DocuFlowDB.bak docuflow-db:/var/opt/mssql/data/
echo "Setting correct file permissions..."
docker exec -u 0 docuflow-db chown mssql:mssql /var/opt/mssql/data/DocuFlowDB.bak
echo "Done! The file is now copied to /var/opt/mssql/data/DocuFlowDB.bak inside the database container."
