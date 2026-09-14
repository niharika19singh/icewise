"""
Unit tests for ICEWISE NavigationGridGraph.
"""

from icewise.grid_graph import NavigationGridGraph
from icewise.interfaces import Waypoint
from icewise.risk_engine import ProbabilisticRiskEngine
from icewise.sample_data import get_sample_iceberg_predictions


def test_grid_graph_construction():
    graph = NavigationGridGraph(
        lat_min=-77.0, lat_max=-75.0,
        lon_min=164.0, lon_max=166.0,
        resolution_deg=0.1
    )
    assert len(graph.nodes) > 0
    # Check that nodes have neighbors
    sample_node = list(graph.nodes)[0]
    assert sample_node in graph.neighbors
    assert len(graph.neighbors[sample_node]) > 0


def test_land_masking():
    graph = NavigationGridGraph(
        lat_min=-78.5, lat_max=-74.0,
        lon_min=162.0, lon_max=168.0,
        resolution_deg=0.1
    )
    # Deep interior of Victoria Land (-77.0, 162.0) or far south Ross Ice Shelf (-78.5, 165.0) should be masked
    assert (-78.5, 165.0) not in graph.nodes


def test_nearest_node_lookup():
    graph = NavigationGridGraph(
        lat_min=-77.0, lat_max=-75.0,
        lon_min=164.0, lon_max=166.0,
        resolution_deg=0.1
    )
    wp = Waypoint(lat=-75.53, lon=164.98)
    nearest = graph.find_nearest_node(wp)
    assert nearest in graph.nodes
    assert abs(nearest[0] - (-75.5)) < 0.1
    assert abs(nearest[1] - (165.0)) < 0.1
