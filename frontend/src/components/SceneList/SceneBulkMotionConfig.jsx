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
import { useI18n } from '../../i18n/useI18n';
import './SceneList.css';

function createRuleId() {
  return `bulk-rule-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function isDurationCondition(type) {
  return type === SCENE_MOTION_BULK_CONDITIONS.DURATION_GREATER_THAN
    || type === SCENE_MOTION_BULK_CONDITIONS.DURATION_LESS_THAN;
}

function formatApplySummary(summary, t) {
  if (!summary) return '';
  const skippedCount = Math.max(0, summary.candidateCount - summary.matchedCount);
  return t('panel.videoPlayer.bulkScene.appliedSummary', {
    matched: summary.matchedCount,
    total: summary.candidateCount,
    skipped: skippedCount,
  });
}

function formatZoomScale(value) {
  return (Number.isFinite(Number(value)) ? Number(value) : 1.18).toFixed(2);
}

export default function SceneBulkMotionConfig({ scenes = [], rules = [], onRulesChange, onApplyBulkMotionConfig }) {
  const { t } = useI18n();
  const [isApplying, setIsApplying] = useState(false);
  const [statusText, setStatusText] = useState('');
  const sceneIds = useMemo(() => scenes.map((scene) => scene.id), [scenes]);
  const conditionCount = useMemo(() => rules.reduce((sum, rule) => sum + Math.max(1, rule.conditions?.length || 0), 0), [rules]);
  const canApply = rules.length > 0 && scenes.length > 0 && !isApplying && typeof onApplyBulkMotionConfig === 'function';
  const conditionOptions = useMemo(() => ([
    { value: SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED, label: t('panel.videoPlayer.bulkScene.detectedFace') },
    { value: SCENE_MOTION_BULK_CONDITIONS.FACE_MISSING, label: t('panel.videoPlayer.bulkScene.noDetectedFace') },
    { value: SCENE_MOTION_BULK_CONDITIONS.DURATION_GREATER_THAN, label: t('panel.videoPlayer.bulkScene.durationGreaterThan') },
    { value: SCENE_MOTION_BULK_CONDITIONS.DURATION_LESS_THAN, label: t('panel.videoPlayer.bulkScene.durationLessThan') },
  ]), [t]);
  const modeOptions = useMemo(() => ([
    { value: SCENE_MOTION_MODES.NONE, label: t('panel.videoPlayer.sceneMotion.none') },
    { value: SCENE_MOTION_MODES.ZOOM_IN, label: t('panel.videoPlayer.sceneMotion.zoomIn') },
    { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT, label: t('panel.videoPlayer.sceneMotion.animationZoomOut') },
    { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_IN, label: t('panel.videoPlayer.sceneMotion.animationZoomIn') },
  ]), [t]);
  const targetOptions = useMemo(() => ([
    { value: SCENE_MOTION_BULK_TARGETS.FACE_OR_CENTER, label: t('panel.videoPlayer.bulkScene.faceOrCenter') },
    { value: SCENE_MOTION_BULK_TARGETS.CENTER, label: t('panel.videoPlayer.bulkScene.center') },
  ]), [t]);
  const operatorOptions = useMemo(() => ([
    { value: SCENE_MOTION_BULK_OPERATORS.AND, label: t('panel.videoPlayer.bulkScene.allConditions') },
    { value: SCENE_MOTION_BULK_OPERATORS.OR, label: t('panel.videoPlayer.bulkScene.anyCondition') },
  ]), [t]);

  const setRules = (updater) => {
    onRulesChange?.(updater);
  };

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
    setStatusText(t('panel.videoPlayer.bulkScene.applying'));
    try {
      const summary = await onApplyBulkMotionConfig({
        rules,
        sceneIds,
        onProgress: ({ index, total }) => {
          setStatusText(t('panel.videoPlayer.bulkScene.checking', { index, total }));
        },
      });
      setStatusText(formatApplySummary(summary, t));
    } catch (error) {
      setStatusText(error?.message || t('panel.videoPlayer.bulkScene.failed'));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="scene-bulk-config dev-locator-host">
      <DeveloperLocator code="panel.video-player.scene-bulk-config" title="Scene Bulk Motion Config" />
      <div className="scene-bulk-config-head">
        <div>
          <div className="scene-bulk-config-title">{t('panel.videoPlayer.bulkScene.title')}</div>
          <div className="scene-bulk-config-meta">{t('panel.videoPlayer.bulkScene.meta', { rules: rules.length, conditions: conditionCount })}</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={addRule} disabled={isApplying}>
          {t('panel.videoPlayer.bulkScene.addRule')}
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="scene-bulk-empty">{t('panel.videoPlayer.bulkScene.empty')}</div>
      ) : (
        <div className="scene-bulk-rule-list">
          {rules.map((rule, index) => (
            <div key={rule.id} className="scene-bulk-rule dev-locator-host">
              <DeveloperLocator code={`panel.video-player.scene-bulk-config.condition.${index}`} title="Scene Bulk Motion Rule" />
              <div className="scene-bulk-rule-head">
                <span>{t('panel.videoPlayer.bulkScene.rule', { index: index + 1 })}</span>
                <button
                  type="button"
                  className="scene-bulk-remove-btn"
                  onClick={() => removeRule(rule.id)}
                  disabled={isApplying}
                  title={t('panel.videoPlayer.bulkScene.removeCondition')}
                >
                  ×
                </button>
              </div>

              <div className="scene-bulk-match-group dev-locator-host">
                <DeveloperLocator code={`panel.video-player.scene-bulk-config.match.${index}`} title="Scene Bulk Motion Match Group" />
                <span className="scene-bulk-group-label">{t('panel.videoPlayer.bulkScene.match')}</span>
                <label className="scene-bulk-inline-select" aria-label={t('panel.videoPlayer.bulkScene.conditionMatchOperator')}>
                  <select
                    value={rule.operator || SCENE_MOTION_BULK_OPERATORS.AND}
                    onChange={(event) => updateRule(rule.id, (currentRule) => ({ ...currentRule, operator: event.target.value }))}
                    disabled={isApplying}
                  >
                    {operatorOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="scene-bulk-add-condition-btn" onClick={() => addCondition(rule.id)} disabled={isApplying}>
                  {t('panel.videoPlayer.bulkScene.addCondition')}
                </button>
              </div>

              <div className="scene-bulk-condition-list">
                {(rule.conditions || [createDefaultSceneMotionBulkCondition()]).map((condition, conditionIndex) => (
                  <div key={`${rule.id}-${conditionIndex}`} className="scene-bulk-condition-row dev-locator-host">
                    <DeveloperLocator code={`panel.video-player.scene-bulk-config.condition.${index}.${conditionIndex}`} title="Scene Bulk Motion Condition" />
                    <div className="scene-bulk-case-group">
                      <span className="scene-bulk-group-label">{t('panel.videoPlayer.bulkScene.case', { index: conditionIndex + 1 })}</span>
                      <label className="scene-bulk-inline-select" aria-label={t('panel.videoPlayer.bulkScene.conditionCase', { index: conditionIndex + 1 })}>
                        <select
                          value={condition.type}
                          onChange={(event) => updateCondition(rule.id, conditionIndex, { type: event.target.value })}
                          disabled={isApplying}
                        >
                          {conditionOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="scene-bulk-remove-btn"
                        onClick={() => removeCondition(rule.id, conditionIndex)}
                        disabled={isApplying || (rule.conditions || []).length <= 1}
                        title={t('panel.videoPlayer.bulkScene.removeCondition')}
                      >
                        ×
                      </button>
                    </div>

                    {isDurationCondition(condition.type) && (
                      <label className="scene-bulk-field">
                        <span>{t('panel.videoPlayer.bulkScene.seconds')}</span>
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
                  <span>{t('panel.videoPlayer.bulkScene.action')}</span>
                  <select
                    value={rule.action.mode}
                    onChange={(event) => updateAction(rule.id, { mode: event.target.value })}
                    disabled={isApplying}
                  >
                    {modeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="scene-bulk-field">
                  <span>{t('panel.videoPlayer.bulkScene.target')}</span>
                  <select
                    value={rule.action.target}
                    onChange={(event) => updateAction(rule.id, { target: event.target.value })}
                    disabled={isApplying}
                  >
                    {targetOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="scene-bulk-field scene-bulk-zoom-field">
                  <span>{t('panel.videoPlayer.bulkScene.zoom', { scale: formatZoomScale(rule.action.zoomScale) })}</span>
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
          {isApplying ? t('panel.videoPlayer.bulkScene.applying') : t('panel.videoPlayer.bulkScene.applyConfig')}
        </button>
        <span className="scene-bulk-status">{statusText}</span>
      </div>
    </section>
  );
}