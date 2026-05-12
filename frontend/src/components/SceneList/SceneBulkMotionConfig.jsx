import { useMemo, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { SCENE_MOTION_MODES } from '../../utils/sceneMotion';
import {
  SCENE_MOTION_BULK_CONDITIONS,
  SCENE_MOTION_BULK_OPERATORS,
  SCENE_MOTION_BULK_TARGETS,
  createDefaultSceneMotionBulkCondition,
  createDefaultSceneMotionBulkRule,
} from '../../utils/sceneMotionBulkConfig';
import './SceneList.css';

const CONDITION_OPTIONS = [
  { value: SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED, label: 'Detected face' },
  { value: SCENE_MOTION_BULK_CONDITIONS.FACE_MISSING, label: 'No detected face' },
  { value: SCENE_MOTION_BULK_CONDITIONS.DURATION_GREATER_THAN, label: 'Duration >' },
  { value: SCENE_MOTION_BULK_CONDITIONS.DURATION_LESS_THAN, label: 'Duration <' },
];

const MODE_OPTIONS = [
  { value: SCENE_MOTION_MODES.NONE, label: 'None' },
  { value: SCENE_MOTION_MODES.ZOOM_IN, label: 'Zoom in' },
  { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT, label: 'Animation zoom out' },
  { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_IN, label: 'Animation zoom in' },
];

const TARGET_OPTIONS = [
  { value: SCENE_MOTION_BULK_TARGETS.FACE_OR_CENTER, label: 'Face / center' },
  { value: SCENE_MOTION_BULK_TARGETS.CENTER, label: 'Center' },
];

const OPERATOR_OPTIONS = [
  { value: SCENE_MOTION_BULK_OPERATORS.AND, label: 'All conditions (AND)' },
  { value: SCENE_MOTION_BULK_OPERATORS.OR, label: 'Any condition (OR)' },
];

function createRuleId() {
  return `bulk-rule-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function isDurationCondition(type) {
  return type === SCENE_MOTION_BULK_CONDITIONS.DURATION_GREATER_THAN
    || type === SCENE_MOTION_BULK_CONDITIONS.DURATION_LESS_THAN;
}

function formatApplySummary(summary) {
  if (!summary) return '';
  const skippedCount = Math.max(0, summary.candidateCount - summary.matchedCount);
  return `Applied ${summary.matchedCount}/${summary.candidateCount} scenes • Skipped ${skippedCount}.`;
}

function formatZoomScale(value) {
  return (Number.isFinite(Number(value)) ? Number(value) : 1.18).toFixed(2);
}

export default function SceneBulkMotionConfig({ scenes = [], onApplyBulkMotionConfig }) {
  const [rules, setRules] = useState([]);
  const [isApplying, setIsApplying] = useState(false);
  const [statusText, setStatusText] = useState('');
  const sceneIds = useMemo(() => scenes.map((scene) => scene.id), [scenes]);
  const conditionCount = useMemo(() => rules.reduce((sum, rule) => sum + Math.max(1, rule.conditions?.length || 0), 0), [rules]);
  const canApply = rules.length > 0 && scenes.length > 0 && !isApplying && typeof onApplyBulkMotionConfig === 'function';

  const addRule = () => {
    setRules((currentRules) => [
      ...currentRules,
      createDefaultSceneMotionBulkRule(createRuleId()),
    ]);
    setStatusText('');
  };

  const removeRule = (ruleId) => {
    setRules((currentRules) => currentRules.filter((rule) => rule.id !== ruleId));
    setStatusText('');
  };

  const updateRule = (ruleId, updater) => {
    setRules((currentRules) => currentRules.map((rule) => (
      rule.id === ruleId ? updater(rule) : rule
    )));
    setStatusText('');
  };

  const updateCondition = (ruleId, conditionIndex, partialCondition) => {
    updateRule(ruleId, (rule) => ({
      ...rule,
      conditions: (rule.conditions || [createDefaultSceneMotionBulkCondition()]).map((condition, index) => (
        index === conditionIndex ? { ...condition, ...partialCondition } : condition
      )),
    }));
  };

  const addCondition = (ruleId) => {
    updateRule(ruleId, (rule) => ({
      ...rule,
      conditions: [
        ...(rule.conditions || [createDefaultSceneMotionBulkCondition()]),
        createDefaultSceneMotionBulkCondition(),
      ],
    }));
  };

  const removeCondition = (ruleId, conditionIndex) => {
    updateRule(ruleId, (rule) => {
      const nextConditions = (rule.conditions || [createDefaultSceneMotionBulkCondition()])
        .filter((_, index) => index !== conditionIndex);

      return {
        ...rule,
        conditions: nextConditions.length > 0 ? nextConditions : [createDefaultSceneMotionBulkCondition()],
      };
    });
  };

  const updateAction = (ruleId, partialAction) => {
    updateRule(ruleId, (rule) => ({
      ...rule,
      action: {
        ...rule.action,
        ...partialAction,
      },
    }));
  };

  const handleApply = async () => {
    if (!canApply) return;

    setIsApplying(true);
    setStatusText('Applying...');
    try {
      const summary = await onApplyBulkMotionConfig({
        rules,
        sceneIds,
        onProgress: ({ index, total }) => {
          setStatusText(`Checking ${index}/${total} scenes...`);
        },
      });
      setStatusText(formatApplySummary(summary));
    } catch (error) {
      setStatusText(error?.message || 'Bulk config failed.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="scene-bulk-config dev-locator-host">
      <DeveloperLocator code="panel.video-player.scene-bulk-config" title="Scene Bulk Motion Config" />
      <div className="scene-bulk-config-head">
        <div>
          <div className="scene-bulk-config-title">Quick scene config</div>
          <div className="scene-bulk-config-meta">{rules.length} rules • {conditionCount} conditions</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={addRule} disabled={isApplying}>
          Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="scene-bulk-empty">No conditions yet.</div>
      ) : (
        <div className="scene-bulk-rule-list">
          {rules.map((rule, index) => (
            <div key={rule.id} className="scene-bulk-rule dev-locator-host">
              <DeveloperLocator code={`panel.video-player.scene-bulk-config.condition.${index}`} title="Scene Bulk Motion Rule" />
              <div className="scene-bulk-rule-head">
                <span>Rule {index + 1}</span>
                <button
                  type="button"
                  className="scene-bulk-remove-btn"
                  onClick={() => removeRule(rule.id)}
                  disabled={isApplying}
                  title="Remove condition"
                >
                  ×
                </button>
              </div>

              <div className="scene-bulk-match-group dev-locator-host">
                <DeveloperLocator code={`panel.video-player.scene-bulk-config.match.${index}`} title="Scene Bulk Motion Match Group" />
                <span className="scene-bulk-group-label">Match</span>
                <label className="scene-bulk-inline-select" aria-label="Condition match operator">
                  <select
                    value={rule.operator || SCENE_MOTION_BULK_OPERATORS.AND}
                    onChange={(event) => updateRule(rule.id, (currentRule) => ({ ...currentRule, operator: event.target.value }))}
                    disabled={isApplying}
                  >
                    {OPERATOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="scene-bulk-add-condition-btn" onClick={() => addCondition(rule.id)} disabled={isApplying}>
                  Add condition
                </button>
              </div>

              <div className="scene-bulk-condition-list">
                {(rule.conditions || [createDefaultSceneMotionBulkCondition()]).map((condition, conditionIndex) => (
                  <div key={`${rule.id}-${conditionIndex}`} className="scene-bulk-condition-row dev-locator-host">
                    <DeveloperLocator code={`panel.video-player.scene-bulk-config.condition.${index}.${conditionIndex}`} title="Scene Bulk Motion Condition" />
                    <div className="scene-bulk-case-group">
                      <span className="scene-bulk-group-label">Case {conditionIndex + 1}</span>
                      <label className="scene-bulk-inline-select" aria-label={`Condition ${conditionIndex + 1} case`}>
                        <select
                          value={condition.type}
                          onChange={(event) => updateCondition(rule.id, conditionIndex, { type: event.target.value })}
                          disabled={isApplying}
                        >
                          {CONDITION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="scene-bulk-remove-btn"
                        onClick={() => removeCondition(rule.id, conditionIndex)}
                        disabled={isApplying || (rule.conditions || []).length <= 1}
                        title="Remove condition"
                      >
                        ×
                      </button>
                    </div>

                    {isDurationCondition(condition.type) && (
                      <label className="scene-bulk-field">
                        <span>Seconds</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={Number.isFinite(Number(condition.seconds)) ? condition.seconds : 0}
                          onChange={(event) => updateCondition(rule.id, conditionIndex, { seconds: event.target.value === '' ? 0 : parseFloat(event.target.value) })}
                          disabled={isApplying}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              <div className="scene-bulk-action dev-locator-host">
                <DeveloperLocator code={`panel.video-player.scene-bulk-config.action.${index}`} title="Scene Bulk Motion Action" />
                <label className="scene-bulk-field">
                  <span>Action</span>
                  <select
                    value={rule.action.mode}
                    onChange={(event) => updateAction(rule.id, { mode: event.target.value })}
                    disabled={isApplying}
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="scene-bulk-field">
                  <span>Target</span>
                  <select
                    value={rule.action.target}
                    onChange={(event) => updateAction(rule.id, { target: event.target.value })}
                    disabled={isApplying}
                  >
                    {TARGET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="scene-bulk-field scene-bulk-zoom-field">
                  <span>Zoom {formatZoomScale(rule.action.zoomScale)}x</span>
                  <input
                    type="range"
                    min="1"
                    max="2.2"
                    step="0.02"
                    value={rule.action.zoomScale}
                    onChange={(event) => updateAction(rule.id, { zoomScale: parseFloat(event.target.value) })}
                    disabled={isApplying}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="scene-bulk-footer">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleApply} disabled={!canApply}>
          {isApplying ? 'Applying...' : 'Apply config'}
        </button>
        <span className="scene-bulk-status">{statusText}</span>
      </div>
    </section>
  );
}