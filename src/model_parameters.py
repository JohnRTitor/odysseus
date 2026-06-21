import json
import logging
from typing import Dict, Any, Optional, List, Type
from pydantic import BaseModel, Field

from src.settings import get_setting, load_settings, save_settings
from core.database import SessionLocal, ModelEndpoint

logger = logging.getLogger(__name__)

class ParameterDef(BaseModel):
    name: str
    display_name: str
    type: str  # "float", "int", "boolean", "string"
    default: Any
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    step: Optional[float] = None
    description: str

PARAMETER_DEFINITIONS = [
    ParameterDef(name="temperature", display_name="Temperature", type="float", default=1.0, min_val=0.0, max_val=2.0, step=0.1, description="Controls randomness. Higher is more creative, lower is more focused."),
    ParameterDef(name="top_p", display_name="Top P", type="float", default=1.0, min_val=0.0, max_val=1.0, step=0.05, description="Nucleus sampling. 0.1 means only top 10% probability mass is considered."),
    ParameterDef(name="top_k", display_name="Top K", type="int", default=0, min_val=0, max_val=100, step=1, description="Limits vocabulary to top K tokens. 0 = disabled."),
    ParameterDef(name="max_tokens", display_name="Max Tokens", type="int", default=0, min_val=0, max_val=131072, step=256, description="Maximum number of tokens to generate. 0 = let provider decide."),
    ParameterDef(name="repeat_penalty", display_name="Repeat Penalty", type="float", default=1.0, min_val=0.0, max_val=2.0, step=0.05, description="Penalizes repeated tokens. >1.0 reduces repetition."),
    ParameterDef(name="presence_penalty", display_name="Presence Penalty", type="float", default=0.0, min_val=-2.0, max_val=2.0, step=0.1, description="Penalizes new tokens based on whether they appear in the text so far."),
    ParameterDef(name="frequency_penalty", display_name="Frequency Penalty", type="float", default=0.0, min_val=-2.0, max_val=2.0, step=0.1, description="Penalizes new tokens based on their existing frequency in the text."),
    ParameterDef(name="seed", display_name="Seed", type="int", default=None, min_val=0, max_val=9999999999, step=1, description="Random seed for reproducible outputs."),
    ParameterDef(name="context_window", display_name="Context Window", type="int", default=0, min_val=0, max_val=2000000, step=1024, description="Size of the context window to allocate (mostly for Ollama/local models). 0 = default."),
    ParameterDef(name="system_prompt", display_name="System Prompt", type="string", default="", description="Optional system prompt to prepend to every request for this model."),
]

class ProviderParamFilter:
    """Base class for parameter filtering by provider."""
    
    @classmethod
    def apply(cls, params: Dict[str, Any], payload: Dict[str, Any], model: str) -> Dict[str, Any]:
        """Apply parameters to the outgoing payload, mapping or stripping as needed.
        By default, adds supported params to the root payload."""
        for key, val in params.items():
            if val is None or val == "":
                continue
            
            # Special keys handled elsewhere
            if key in ["system_prompt", "stream"]:
                continue
                
            if cls.supports(key, model):
                mapped_key, mapped_val = cls.map_param(key, val)
                cls.inject(payload, mapped_key, mapped_val)
                
        return payload
        
    @classmethod
    def supports(cls, param_name: str, model: str) -> bool:
        """Return True if the provider supports this parameter."""
        return True
        
    @classmethod
    def map_param(cls, param_name: str, val: Any) -> tuple[str, Any]:
        """Map parameter name/value to provider-specific format."""
        return param_name, val
        
    @classmethod
    def inject(cls, payload: Dict[str, Any], key: str, val: Any):
        """Inject mapped key/val into payload."""
        payload[key] = val

class OpenAICompatProvider(ProviderParamFilter):
    """Standard OpenAI API compatibility layer."""
    @classmethod
    def supports(cls, param_name: str, model: str) -> bool:
        # Standard OpenAI parameters
        return param_name in [
            "temperature", "top_p", "max_tokens", 
            "presence_penalty", "frequency_penalty", "seed"
        ]

class AnthropicProvider(ProviderParamFilter):
    """Anthropic API."""
    @classmethod
    def supports(cls, param_name: str, model: str) -> bool:
        # Anthropic standard params
        return param_name in ["temperature", "top_p", "top_k", "max_tokens"]
        
    @classmethod
    def map_param(cls, param_name: str, val: Any) -> tuple[str, Any]:
        # Anthropic calls max_tokens max_tokens (OpenAI sometimes uses max_completion_tokens but we handle that in llm_core)
        return param_name, val

class OllamaProvider(ProviderParamFilter):
    """Native Ollama API (/api/chat)."""
    @classmethod
    def supports(cls, param_name: str, model: str) -> bool:
        # Ollama supports pretty much everything via options
        return param_name in [
            "temperature", "top_p", "top_k", "max_tokens", 
            "repeat_penalty", "presence_penalty", "frequency_penalty", 
            "seed", "context_window"
        ]
        
    @classmethod
    def map_param(cls, param_name: str, val: Any) -> tuple[str, Any]:
        if param_name == "max_tokens":
            return "num_predict", val
        elif param_name == "context_window":
            return "num_ctx", val
        return param_name, val
        
    @classmethod
    def inject(cls, payload: Dict[str, Any], key: str, val: Any):
        if "options" not in payload:
            payload["options"] = {}
        payload["options"][key] = val

def get_provider_filter(provider_name: str) -> Type[ProviderParamFilter]:
    if provider_name == "ollama":
        return OllamaProvider
    elif provider_name == "anthropic":
        return AnthropicProvider
    # Default to OpenAICompatProvider for openai, openrouter, deepseek, etc.
    return OpenAICompatProvider

def get_global_defaults() -> Dict[str, Any]:
    """Get global AI parameters from settings."""
    defaults = get_setting("ai_defaults", {})
    return defaults if isinstance(defaults, dict) else {}

def set_global_defaults(params: Dict[str, Any]):
    """Set global AI parameters."""
    settings = load_settings()
    settings["ai_defaults"] = params
    save_settings(settings)

def get_model_parameters(endpoint_id: str, model_id: str) -> Dict[str, Any]:
    """Get raw parameters for a specific model."""
    db = SessionLocal()
    try:
        ep = db.query(ModelEndpoint).filter(ModelEndpoint.id == endpoint_id).first()
        if ep and ep.model_parameters:
            try:
                params_dict = json.loads(ep.model_parameters)
                if isinstance(params_dict, dict):
                    return params_dict.get(model_id, {})
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse model_parameters for endpoint {endpoint_id}")
    finally:
        db.close()
    return {}

def set_model_parameters(endpoint_id: str, model_id: str, params: Dict[str, Any]):
    """Set parameters for a specific model."""
    db = SessionLocal()
    try:
        ep = db.query(ModelEndpoint).filter(ModelEndpoint.id == endpoint_id).first()
        if not ep:
            return
            
        params_dict = {}
        if ep.model_parameters:
            try:
                params_dict = json.loads(ep.model_parameters)
            except json.JSONDecodeError:
                pass
                
        if not isinstance(params_dict, dict):
            params_dict = {}
            
        params_dict[model_id] = params
        ep.model_parameters = json.dumps(params_dict)
        db.commit()
    finally:
        db.close()

def delete_model_parameters(endpoint_id: str, model_id: str):
    """Delete parameters for a specific model."""
    db = SessionLocal()
    try:
        ep = db.query(ModelEndpoint).filter(ModelEndpoint.id == endpoint_id).first()
        if not ep or not ep.model_parameters:
            return
            
        try:
            params_dict = json.loads(ep.model_parameters)
            if isinstance(params_dict, dict) and model_id in params_dict:
                del params_dict[model_id]
                ep.model_parameters = json.dumps(params_dict)
                db.commit()
        except json.JSONDecodeError:
            pass
    finally:
        db.close()

def resolve_parameters(endpoint_url: str, model_id: str) -> Dict[str, Any]:
    """Resolve parameters for a model (global defaults overridden by model specifics)."""
    merged = {}
    
    # Start with global defaults
    global_defaults = get_global_defaults()
    if global_defaults:
        merged.update(global_defaults)
        
    # Override with model-specific params
    db = SessionLocal()
    try:
        from src.endpoint_resolver import normalize_base
        norm_req = normalize_base(endpoint_url)
        
        # Match endpoint by normalized base_url
        endpoints = db.query(ModelEndpoint).all()
        ep = None
        for e in endpoints:
            if e.base_url and normalize_base(e.base_url) == norm_req:
                ep = e
                break
                
        if ep and ep.model_parameters:
            try:
                params_dict = json.loads(ep.model_parameters)
                if isinstance(params_dict, dict) and model_id in params_dict:
                    # Clean out empty/null values before merging
                    model_params = {k: v for k, v in params_dict[model_id].items() if v is not None and v != ""}
                    merged.update(model_params)
            except json.JSONDecodeError:
                pass
    finally:
        db.close()
        
    return merged

def validate_parameter(name: str, value: Any) -> Any:
    """Validate and coerce a parameter value based on definitions."""
    if value is None or value == "":
        return value
        
    # Find definition
    pdef = next((p for p in PARAMETER_DEFINITIONS if p.name == name), None)
    if not pdef:
        # Allow unknown parameters to pass through (flexibility)
        return value
        
    try:
        if pdef.type == "float":
            val = float(value)
            if pdef.min_val is not None and val < pdef.min_val: val = pdef.min_val
            if pdef.max_val is not None and val > pdef.max_val: val = pdef.max_val
            return val
        elif pdef.type == "int":
            val = int(value)
            if pdef.min_val is not None and val < pdef.min_val: val = pdef.min_val
            if pdef.max_val is not None and val > pdef.max_val: val = pdef.max_val
            return val
        elif pdef.type == "boolean":
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes")
            return bool(value)
        elif pdef.type == "string":
            return str(value)
    except (ValueError, TypeError):
        return pdef.default
        
    return value

def resolve_and_apply_parameters(payload: Dict[str, Any], endpoint_url: str, model_id: str, provider: str) -> Dict[str, Any]:
    """Resolve parameters for a model and inject them into the outgoing payload.
    
    This merges global defaults and model-specific parameters, filters out
    parameters that the provider does not support, and maps them to the
    provider's specific payload format.
    """
    # 1. Resolve parameters (global overridden by model-specific)
    params = resolve_parameters(endpoint_url, model_id)
    if not params:
        return payload
        
    # 2. Don't overwrite parameters already set in the payload by the caller
    # (e.g. if the caller explicitly passed temperature=0.5 to llm_call, keep it)
    final_params = {}
    for k, v in params.items():
        if k not in payload:
            final_params[k] = v
            
    # 3. Apply via provider-specific filter
    filter_cls = get_provider_filter(provider)
    return filter_cls.apply(final_params, payload, model_id)
