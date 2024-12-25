# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List  # python v3.11+
from pydantic import ValidationError  # pydantic v2.0+
import yara  # yara-python v4.3.0
from ratelimit import RateLimiter  # ratelimit v2.2.1
from prometheus_client import Counter, Histogram, Gauge  # prometheus_client v0.17.1
import logging
from functools import wraps

# Internal imports
from app.schemas.translation import TranslationBase

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
YARA_FIELD_MAPPINGS = {
    "process": {
        "process_name": "process.name",
        "process_id": "process.pid",
        "process_path": "process.path",
        "command_line": "process.command_line",
        "parent_process": "process.parent"
    },
    "file": {
        "file_name": "file.name",
        "file_path": "file.path",
        "file_hash": "file.hash",
        "file_size": "file.size"
    },
    "network": {
        "source_ip": "network.source.ip",
        "destination_ip": "network.destination.ip",
        "source_port": "network.source.port",
        "destination_port": "network.destination.port",
        "protocol": "network.protocol"
    },
    "registry": {
        "key_path": "registry.key_path",
        "value_name": "registry.value_name",
        "value_data": "registry.value_data"
    }
}

YARA_RULE_TEMPLATE = """
rule {name} {{
    meta:
        description = "{description}"
        author = "{author}"
        severity = "{severity}"
        created = "{created}"
        mitre_attack = "{mitre_attack}"
        
    events:
        {event_selectors}
        
    condition:
        {condition}
}}
"""

def metrics_decorator(func):
    """Decorator for tracking function performance metrics"""
    latency_metric = Histogram(
        f"yara_translator_{func.__name__}_latency_seconds",
        f"Latency of {func.__name__} operation",
        buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
    )
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        with latency_metric.time():
            return func(*args, **kwargs)
    return wrapper

class YARATranslator:
    """
    Translator for Chronicle YARA-L detection rules with performance monitoring 
    and rate limiting.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize YARA translator with configuration, rate limiting, and metrics.
        
        Args:
            config: Configuration dictionary for the translator
        """
        self._config = config
        self._field_mappings = YARA_FIELD_MAPPINGS
        
        # Initialize rate limiter (500 req/min as per Chronicle requirements)
        self._rate_limiter = RateLimiter(max_calls=500, period=60)
        
        # Initialize performance metrics
        self._metrics = {
            "translations": Counter(
                "yara_translations_total",
                "Total number of YARA-L translations",
                ["direction", "status"]
            ),
            "validation_errors": Counter(
                "yara_validation_errors_total",
                "Total number of YARA-L validation errors",
                ["error_type"]
            ),
            "rule_complexity": Gauge(
                "yara_rule_complexity",
                "Complexity score of YARA-L rules"
            )
        }
        
        logger.info("Initialized YARA-L translator with rate limiting and metrics")

    @metrics_decorator
    def translate(self, detection_logic: Dict[str, Any], direction: str) -> Dict[str, Any]:
        """
        Translates detection logic to/from YARA-L format with rate limiting and metrics.
        
        Args:
            detection_logic: Source detection logic
            direction: Translation direction ('to_yara' or 'from_yara')
            
        Returns:
            Translated detection logic
            
        Raises:
            ValueError: If translation fails
            RateLimitExceeded: If rate limit is exceeded
        """
        try:
            # Apply rate limiting
            with self._rate_limiter:
                if direction == "to_yara":
                    result = self._translate_to_yara(detection_logic)
                elif direction == "from_yara":
                    result = self._translate_from_yara(detection_logic)
                else:
                    raise ValueError(f"Invalid translation direction: {direction}")
                
                # Track successful translation
                self._metrics["translations"].labels(
                    direction=direction,
                    status="success"
                ).inc()
                
                return result
                
        except Exception as e:
            # Track failed translation
            self._metrics["translations"].labels(
                direction=direction,
                status="error"
            ).inc()
            
            logger.error(f"Translation failed: {str(e)}")
            raise

    @metrics_decorator
    def validate_rule(self, rule_logic: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validates YARA-L rule syntax and structure with Chronicle-specific checks.
        
        Args:
            rule_logic: YARA-L rule to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Validate required fields
            required_fields = {"name", "events", "condition"}
            if not all(field in rule_logic for field in required_fields):
                raise ValueError(f"Missing required fields: {required_fields - rule_logic.keys()}")
            
            # Validate rule syntax
            rule_string = self._generate_rule(rule_logic)
            yara.compile(source=rule_string)
            
            # Validate Chronicle-specific requirements
            if not self._validate_chronicle_compatibility(rule_logic):
                raise ValueError("Rule does not meet Chronicle requirements")
            
            # Calculate and track rule complexity
            complexity = self._calculate_rule_complexity(rule_logic)
            self._metrics["rule_complexity"].set(complexity)
            
            return True, None
            
        except Exception as e:
            error_msg = str(e)
            self._metrics["validation_errors"].labels(
                error_type=type(e).__name__
            ).inc()
            
            logger.error(f"Rule validation failed: {error_msg}")
            return False, error_msg

    def _map_fields(self, detection_fields: Dict[str, Any]) -> Dict[str, Any]:
        """
        Maps universal field names to YARA-L specific fields with Chronicle data model.
        
        Args:
            detection_fields: Source detection fields
            
        Returns:
            Mapped YARA-L fields
        """
        mapped_fields = {}
        
        for category, fields in detection_fields.items():
            if category in self._field_mappings:
                category_mappings = self._field_mappings[category]
                mapped_fields[category] = {
                    category_mappings.get(field_name, field_name): field_value
                    for field_name, field_value in fields.items()
                }
            else:
                mapped_fields[category] = fields
                
        return mapped_fields

    def _generate_rule(self, mapped_fields: Dict[str, Any]) -> str:
        """
        Generates optimized YARA-L rule from mapped fields.
        
        Args:
            mapped_fields: YARA-L mapped fields
            
        Returns:
            YARA-L rule string
        """
        # Extract metadata
        metadata = mapped_fields.get("metadata", {})
        
        # Build event selectors
        event_selectors = []
        for category, fields in mapped_fields.items():
            if category not in ["metadata", "condition"]:
                selector = self._build_event_selector(category, fields)
                event_selectors.append(selector)
                
        # Generate rule string
        rule = YARA_RULE_TEMPLATE.format(
            name=mapped_fields["name"],
            description=metadata.get("description", ""),
            author=metadata.get("author", ""),
            severity=metadata.get("severity", "medium"),
            created=metadata.get("created", ""),
            mitre_attack=metadata.get("mitre_attack", ""),
            event_selectors="\n        ".join(event_selectors),
            condition=mapped_fields.get("condition", "true")
        )
        
        return rule

    def _validate_chronicle_compatibility(self, rule_logic: Dict[str, Any]) -> bool:
        """Validates Chronicle-specific rule requirements"""
        try:
            # Validate severity levels
            valid_severities = {"low", "medium", "high", "critical"}
            if rule_logic.get("metadata", {}).get("severity") not in valid_severities:
                return False
            
            # Validate event types
            valid_event_types = {"process", "file", "network", "registry"}
            rule_events = set(rule_logic.get("events", {}).keys())
            if not rule_events.issubset(valid_event_types):
                return False
            
            # Validate condition complexity
            condition = rule_logic.get("condition", "")
            if condition.count("or") + condition.count("and") > 10:
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Chronicle compatibility check failed: {str(e)}")
            return False

    def _calculate_rule_complexity(self, rule_logic: Dict[str, Any]) -> float:
        """Calculates rule complexity score"""
        complexity_factors = {
            "event_count": len(rule_logic.get("events", {})) * 0.2,
            "condition_complexity": (
                rule_logic.get("condition", "").count("and") * 0.3 +
                rule_logic.get("condition", "").count("or") * 0.4
            ),
            "field_count": sum(
                len(fields) for fields in rule_logic.get("events", {}).values()
            ) * 0.1
        }
        
        return sum(complexity_factors.values())

    def _build_event_selector(self, category: str, fields: Dict[str, Any]) -> str:
        """Builds YARA-L event selector string"""
        selector_parts = []
        
        for field_name, field_value in fields.items():
            if isinstance(field_value, (list, tuple)):
                selector = f"{field_name} in {field_value}"
            elif isinstance(field_value, str) and "*" in field_value:
                selector = f"{field_name} matches {field_value}"
            else:
                selector = f"{field_name} == {field_value}"
            selector_parts.append(selector)
            
        return f"$event.{category} where {' and '.join(selector_parts)}"

    def _translate_to_yara(self, detection_logic: Dict[str, Any]) -> Dict[str, Any]:
        """Translates universal format to YARA-L"""
        mapped_fields = self._map_fields(detection_logic)
        rule_string = self._generate_rule(mapped_fields)
        
        return {
            "query": rule_string,
            "platform_specific": {
                "rule_type": "YARA-L",
                "severity": mapped_fields.get("metadata", {}).get("severity", "medium")
            }
        }

    def _translate_from_yara(self, detection_logic: Dict[str, Any]) -> Dict[str, Any]:
        """Translates YARA-L to universal format"""
        # Parse YARA-L rule
        rule_string = detection_logic["query"]
        rule = yara.compile(source=rule_string)
        
        # Extract fields and conditions
        fields = {}
        for category in YARA_FIELD_MAPPINGS:
            category_fields = self._extract_category_fields(rule_string, category)
            if category_fields:
                fields[category] = category_fields
                
        return {
            "query": fields,
            "data_model": "Chronicle",
            "platform_specific": detection_logic.get("platform_specific", {})
        }

    def _extract_category_fields(self, rule_string: str, category: str) -> Dict[str, Any]:
        """Extracts fields for a specific category from YARA-L rule"""
        fields = {}
        category_pattern = f"$event.{category} where"
        
        if category_pattern in rule_string:
            # Extract and parse field conditions
            start_idx = rule_string.index(category_pattern)
            end_idx = rule_string.find("}", start_idx)
            conditions = rule_string[start_idx:end_idx].split("where")[1].strip()
            
            # Parse individual field conditions
            for condition in conditions.split("and"):
                field_name, operator, value = self._parse_condition(condition.strip())
                fields[field_name] = value
                
        return fields

    def _parse_condition(self, condition: str) -> tuple[str, str, Any]:
        """Parses a YARA-L condition into components"""
        operators = {"==": "equals", "in": "in", "matches": "matches"}
        
        for op in operators:
            if op in condition:
                field_name, value = condition.split(op)
                return field_name.strip(), op, eval(value.strip())
                
        raise ValueError(f"Invalid condition format: {condition}")