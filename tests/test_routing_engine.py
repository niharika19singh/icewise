"""
Unit tests for ICEWISE RouteOptimizer (A* and Dijkstra).
"""

from icewise.grid_graph import NavigationGridGraph
from icewise.risk_engine import ProbabilisticRiskEngine
from icewise.routing_engine import RouteOptimizer
from icewise.sample_data import get_sample_iceberg_predictions, get_sample_vessel_profile
from icewise.interfaces import Waypoint


def test_astar_route_finding():
    vessel = get_sample_vessel_profile()
    preds = get_sample_iceberg_predictions()
    risk_engine = ProbabilisticRiskEngine(iceberg_predictions=preds)

    graph = NavigationGridGraph(
        lat_min=-78.0, lat_max=-74.5,
        lon_min=164.0, lon_max=167.5,
        resolution_deg=0.1,
        risk_engine=risk_engine
    )

    optimizer = RouteOptimizer(graph=graph, vessel=vessel)
    path, cost = optimizer.find_route_astar()

    assert len(path) > 1
    assert path[0] == graph.find_nearest_node(vessel.start_point)
    assert path[-1] == graph.find_nearest_node(vessel.destination)
    assert cost > 0.0


def test_dijkstra_route_finding():
    vessel = get_sample_vessel_profile()
    preds = get_sample_iceberg_predictions()
    risk_engine = ProbabilisticRiskEngine(iceberg_predictions=preds)

    graph = NavigationGridGraph(
        lat_min=-78.0, lat_max=-74.5,
        lon_min=164.0, lon_max=167.5,
        resolution_deg=0.1,
        risk_engine=risk_engine
    )

    optimizer = RouteOptimizer(graph=graph, vessel=vessel)
    path_dijkstra, cost_dijkstra = optimizer.find_route_dijkstra()
    path_astar, cost_astar = optimizer.find_route_astar()

    # Dijkstra and A* with admissible heuristic should yield identical or near-identical cost
    assert abs(cost_dijkstra - cost_astar) < 1e-4
    assert path_dijkstra == path_astar


def test_risk_avoidance_behavior():
    """
    Verifies that the route engine skirts wide around high-risk iceberg coordinates
    rather than passing straight through them.
    """
    vessel = get_sample_vessel_profile()
    vessel.risk_tolerance_factor = 10.0  # High risk penalty
    preds = get_sample_iceberg_predictions()
    risk_engine = ProbabilisticRiskEngine(iceberg_predictions=preds)

    graph = NavigationGridGraph(
        lat_min=-78.0, lat_max=-74.5,
        lon_min=164.0, lon_max=167.5,
        resolution_deg=0.1,
        risk_engine=risk_engine
    )

    optimizer = RouteOptimizer(graph=graph, vessel=vessel)
    path, _ = optimizer.find_route_astar()

    # Check that no node along path exceeds max risk threshold
    for node in path:
        assert graph.node_risk[node] <= vessel.max_risk_threshold
