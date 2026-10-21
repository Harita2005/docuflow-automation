-- ============================================================================
-- FOR HUMAN REVIEW - NOT EXECUTED
-- Script: 02_update_rule_7916_feedback_condition.sql
-- Database: SQL Server (DocuFlowDB)
-- Description: Adds a strict document_type condition to BusinessRule ID 7916 ('Feedback')
--              to prevent it from acting as a greedy wildcard for all documents in the division.
-- Note: Checked against models.py - business_rules table has columns:
--       id, rule_name, rule_action, target_workflow_id, document_type, conditions_json, created_at, deleted_at
--       (There is NO updated_at column in business_rules).
-- ============================================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    -- 1. Preview existing row state before modification
    SELECT id, rule_name, rule_action, target_workflow_id, document_type, conditions_json, created_at
    FROM business_rules 
    WHERE id = 7916;

    -- 2. Update rule 7916 with explicit document_type and compound condition
    UPDATE business_rules
    SET 
        document_type = 'CUSTOMER FEEDBACK',
        conditions_json = '{"match_type": "ALL", "condition_type": "Combination Condition", "conditions": [{"field": "Division", "operator": "equals", "value": "VCC, ACC, ACM, ATC, ENES, ENES_ER, VT_ER, VT, TARA", "logicalOperator": "AND"}, {"field": "document_type", "operator": "equals", "value": "CUSTOMER FEEDBACK", "logicalOperator": "AND"}], "settings": {"case_sensitive": false, "null_handling": "Consider as False"}}'
    WHERE id = 7916;

    -- 3. Verify updated row state
    SELECT id, rule_name, rule_action, target_workflow_id, document_type, conditions_json
    FROM business_rules 
    WHERE id = 7916;

    COMMIT TRANSACTION;
    PRINT 'SUCCESS: Rule 7916 updated successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    PRINT 'ERROR occurred during update: ' + @ErrorMessage;
    RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
