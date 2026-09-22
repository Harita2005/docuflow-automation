import pyodbc
conn = pyodbc.connect('Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=DocuFlowDB;Trusted_Connection=yes;')
cursor = conn.cursor()
cursor.execute("SELECT TOP 5 doc_key, document_type, custom_data FROM documents ORDER BY created_at DESC")
rows = cursor.fetchall()
for row in rows:
  print(row.doc_key, row.document_type, row.custom_data)
