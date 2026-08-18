import datetime
from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, Boolean, DateTime, Date, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


class WfWorkflow(Base):
    __tablename__ = "wf_workflow"

    workflow_id   = Column(BigInteger, primary_key=True, autoincrement=True)
    workflow_code = Column(String(100), unique=True, nullable=False, index=True)
    workflow_name = Column(String(255), nullable=False)
    workflow_type = Column(String(100), nullable=True)
    description   = Column(Text, nullable=True)
    is_active     = Column(Boolean, default=True, nullable=False)
    created_at    = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rules     = relationship("WfRule", back_populates="workflow")
    templates = relationship("WfChecklistTemplate", back_populates="workflow")


class WfRule(Base):
    __tablename__ = "wf_rule"

    rule_id        = Column(BigInteger, primary_key=True, autoincrement=True)
    workflow_id    = Column(BigInteger, ForeignKey("wf_workflow.workflow_id"), nullable=False, index=True)
    rule_name      = Column(String(255), nullable=False)
    condition_type = Column(String(20), default="AND", nullable=False)
    priority       = Column(Integer, nullable=False, default=10, index=True)
    rule_code      = Column(String(150), nullable=True)
    description    = Column(Text, nullable=True)
    is_active      = Column(Boolean, default=True, nullable=False, index=True)
    created_at     = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workflow   = relationship("WfWorkflow", back_populates="rules")
    conditions = relationship("WfRuleCondition", back_populates="rule", cascade="all, delete-orphan")


class WfRuleCondition(Base):
    __tablename__ = "wf_rule_condition"

    condition_id     = Column(BigInteger, primary_key=True, autoincrement=True)
    rule_id          = Column(BigInteger, ForeignKey("wf_rule.rule_id"), nullable=False, index=True)
    field_name       = Column(String(100), nullable=False, index=True)
    operator         = Column(String(50), nullable=False)
    logical_operator = Column(String(10), default="AND", nullable=False)
    condition_order  = Column(Integer, nullable=False, default=1)
    is_active        = Column(Boolean, default=True, nullable=False)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rule   = relationship("WfRule", back_populates="conditions")
    values = relationship("WfRuleConditionValue", back_populates="condition", cascade="all, delete-orphan")


class WfRuleConditionValue(Base):
    __tablename__ = "wf_rule_condition_value"

    condition_value_id = Column(BigInteger, primary_key=True, autoincrement=True)
    condition_id       = Column(BigInteger, ForeignKey("wf_rule_condition.condition_id"), nullable=False, index=True)
    value              = Column(String(500), nullable=False)
    normalized_value   = Column(String(500), nullable=False, index=True)
    sequence           = Column(Integer, nullable=True)
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=datetime.datetime.utcnow)

    condition = relationship("WfRuleCondition", back_populates="values")


class WfChecklistTemplate(Base):
    __tablename__ = "wf_checklist_template"

    checklist_template_id = Column(BigInteger, primary_key=True, autoincrement=True)
    workflow_id           = Column(BigInteger, ForeignKey("wf_workflow.workflow_id"), nullable=False, index=True)
    template_name         = Column(String(255), nullable=False)
    description           = Column(Text, nullable=True)
    is_active             = Column(Boolean, default=True)
    created_at            = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at            = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workflow = relationship("WfWorkflow", back_populates="templates")
    stages   = relationship("WfChecklistStage", back_populates="template", cascade="all, delete-orphan")


class WfChecklistStage(Base):
    __tablename__ = "wf_checklist_stage"

    stage_id              = Column(BigInteger, primary_key=True, autoincrement=True)
    checklist_template_id = Column(BigInteger, ForeignKey("wf_checklist_template.checklist_template_id"), nullable=False, index=True)
    stage_name            = Column(String(150), nullable=False)
    stage_order           = Column(Integer, nullable=False)
    is_active             = Column(Boolean, default=True)
    created_at            = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at            = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    template = relationship("WfChecklistTemplate", back_populates="stages")
    items    = relationship("WfChecklistItem", back_populates="stage", cascade="all, delete-orphan")


class WfChecklistItem(Base):
    __tablename__ = "wf_checklist_item"

    checklist_item_id = Column(BigInteger, primary_key=True, autoincrement=True)
    stage_id          = Column(BigInteger, ForeignKey("wf_checklist_stage.stage_id"), nullable=False, index=True)
    item_code         = Column(String(100), nullable=True)
    item_name         = Column(String(500), nullable=False)
    item_type         = Column(String(50), default="CHECKBOX")
    item_order        = Column(Integer, nullable=False)
    is_required       = Column(Boolean, default=False)
    is_active         = Column(Boolean, default=True)
    created_at        = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    stage = relationship("WfChecklistStage", back_populates="items")


class WfExecutionInput(Base):
    __tablename__ = "wf_execution_input"

    input_id           = Column(BigInteger, primary_key=True, autoincrement=True)
    source_system      = Column(String(100), nullable=True)
    external_record_id = Column(String(150), nullable=True)
    division           = Column(String(255), nullable=True)
    plant              = Column(String(255), nullable=True)
    category           = Column(String(255), nullable=True)
    cost_center        = Column(String(500), nullable=True)
    raw_payload        = Column(Text, nullable=True)
    received_at        = Column(DateTime, default=datetime.datetime.utcnow)

    executions = relationship("WfExecution", back_populates="input")
    match_logs = relationship("WfMatchLog", back_populates="input")


class WfExecution(Base):
    __tablename__ = "wf_execution"

    execution_id     = Column(BigInteger, primary_key=True, autoincrement=True)
    workflow_id      = Column(BigInteger, ForeignKey("wf_workflow.workflow_id"), nullable=False, index=True)
    rule_id          = Column(BigInteger, ForeignKey("wf_rule.rule_id"), nullable=False, index=True)
    input_id         = Column(BigInteger, ForeignKey("wf_execution_input.input_id"), nullable=False, index=True)
    status           = Column(String(50), default="PENDING", nullable=False)
    current_stage_id = Column(BigInteger, ForeignKey("wf_checklist_stage.stage_id"), nullable=True)
    started_at       = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at     = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workflow   = relationship("WfWorkflow")
    rule       = relationship("WfRule")
    input      = relationship("WfExecutionInput", back_populates="executions")
    checklist  = relationship("WfExecutionChecklist", back_populates="execution", cascade="all, delete-orphan")


class WfExecutionChecklist(Base):
    __tablename__ = "wf_execution_checklist"

    execution_checklist_id = Column(BigInteger, primary_key=True, autoincrement=True)
    execution_id           = Column(BigInteger, ForeignKey("wf_execution.execution_id"), nullable=False, index=True)
    checklist_item_id      = Column(BigInteger, ForeignKey("wf_checklist_item.checklist_item_id"), nullable=False, index=True)
    status                 = Column(String(30), default="PENDING", nullable=False)
    remarks                = Column(Text, nullable=True)
    completed_by           = Column(BigInteger, nullable=True)
    completed_at           = Column(DateTime, nullable=True)
    created_at             = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at             = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    execution      = relationship("WfExecution", back_populates="checklist")
    checklist_item = relationship("WfChecklistItem")


class WfMatchLog(Base):
    __tablename__ = "wf_match_log"

    match_log_id       = Column(BigInteger, primary_key=True, autoincrement=True)
    input_id           = Column(BigInteger, ForeignKey("wf_execution_input.input_id"), nullable=False, index=True)
    rule_id            = Column(BigInteger, ForeignKey("wf_rule.rule_id"), nullable=False, index=True)
    matched            = Column(Boolean, nullable=False)
    priority           = Column(Integer, nullable=True)
    matched_conditions = Column(Integer, default=0)
    failed_conditions  = Column(Integer, default=0)
    evaluation_details = Column(Text, nullable=True)
    evaluated_at       = Column(DateTime, default=datetime.datetime.utcnow)

    input = relationship("WfExecutionInput", back_populates="match_logs")
    rule  = relationship("WfRule")


# Indexes
Index("ix_wf_rule_workflow_active_priority", WfRule.workflow_id, WfRule.is_active, WfRule.priority)
Index("ix_wf_cond_rule_field", WfRuleCondition.rule_id, WfRuleCondition.field_name)
Index("ix_wf_condval_cond_norm", WfRuleConditionValue.condition_id, WfRuleConditionValue.normalized_value)
Index("ix_wf_stage_template", WfChecklistStage.checklist_template_id)
Index("ix_wf_item_stage", WfChecklistItem.stage_id)
Index("ix_wf_exec_workflow_rule", WfExecution.workflow_id, WfExecution.rule_id)
Index("ix_wf_exec_checklist_exec", WfExecutionChecklist.execution_id)
Index("ix_wf_matchlog_input_rule", WfMatchLog.input_id, WfMatchLog.rule_id)
