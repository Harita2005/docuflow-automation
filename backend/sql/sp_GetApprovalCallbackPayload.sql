-- ===================================================================================
-- DocuFlow Automation - Dynamic Stored Procedure Callback Payload Script
-- Procedure: sp_GetApprovalCallbackPayload
-- Description: Generates a complete, dynamic JSON payload for a document upon approval
--              passing @DocKey as parameter for external 3rd-party system consumption.
-- ===================================================================================

IF OBJECT_ID('sp_GetApprovalCallbackPayload', 'P') IS NOT NULL
    DROP PROCEDURE sp_GetApprovalCallbackPayload;
GO

CREATE PROCEDURE sp_GetApprovalCallbackPayload
    @DocKey VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        d.id AS documentId,
        d.doc_key AS externalDocKey,
        d.invoice_number AS invoiceNumber,
        d.party_name AS vendorName,
        d.party_code AS vendorCode,
        d.amount AS grandTotal,
        d.base_amount AS baseAmount,
        d.tax_amount AS totalTax,
        d.cgst AS cgst,
        d.sgst AS sgst,
        d.igst AS igst,
        d.division AS companyCode,
        d.plant AS branchCode,
        d.cost_center AS costCenter,
        d.status AS approvalStatus,
        d.current_stage AS currentStage,
        d.assigned_approver AS activeApprover,
        d.workflow_profile_id AS workflowProfile,
        d.created_at AS documentCreatedAt,
        SYSUTCDATETIME() AS payloadGeneratedAt,
        
        -- Embedded Line Items Sub-Query (SQL FOR JSON PATH)
        (
            SELECT 
                li.id AS lineItemId,
                li.item_code AS itemCode,
                li.description AS itemDescription,
                li.quantity AS quantity,
                li.unit_price AS unitPrice,
                li.amount AS lineAmount,
                li.warranty_text AS warrantyText,
                li.serial_numbers AS serialNumbers
            FROM document_line_items li
            WHERE li.invoice_id = d.id
            FOR JSON PATH
        ) AS items,

        -- Embedded Approval Audit History Array
        (
            SELECT 
                al.[user] AS actionUser,
                al.action AS actionTaken,
                al.stage AS workflowStage,
                al.notes AS comments,
                al.timestamp AS actionTimestamp
            FROM document_approval_logs al
            WHERE al.invoice_id = d.id OR al.invoice_id = 'DOC-' + d.id
            ORDER BY al.timestamp ASC
            FOR JSON PATH
        ) AS approvalHistory

    FROM documents d
    WHERE d.id = @DocKey 
       OR d.doc_key = @DocKey 
       OR d.invoice_number = @DocKey
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
END;
GO
