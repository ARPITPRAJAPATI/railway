const { esClient, TRAIN_INDEX, STATION_INDEX } = require('../config/elasticsearch');
const logger = require('../config/logger');

// ═══════════════════════════════════════════════════
//  INDEX OPERATIONS (called by Kafka consumer)
// ═══════════════════════════════════════════════════

/**
 * When admin creates a station, index it for autocomplete.
 * Event shape: { eventType, data: { id, name, code, city, state }, timestamp }
 */
const indexStation = async (event) => {
    const station = event.data;
    if (!station) return;

    try {
        await esClient.index({
            index: STATION_INDEX,
            id: station.id,
            document: {
                stationId: station.id,
                name: station.name,
                code: station.code,
                city: station.city,
                suggest: {
                    input: [station.name, station.code, station.city].filter(Boolean),
                    weight: 10,
                },
            },
            refresh: true,
        });
        logger.info(`Indexed station ${station.name} (${station.code})`);
    } catch (err) {
        logger.error(`Failed to index station: ${err.message}`);
    }
};

/**
 * When admin creates a route, we get enriched payload with train+seats+routeStations.
 */
const indexTrainRoute = async (routeEvent) => {
    const { train, routeStations } = routeEvent;
    if (!train || !routeStations) return;

    const seatSummary = { total: 0, LOWER: 0, MIDDLE: 0, UPPER: 0, SIDE_LOWER: 0, SIDE_UPPER: 0 };
    (train.seats || []).forEach((s) => {
        seatSummary.total++;
        if (seatSummary[s.seatType] !== undefined) seatSummary[s.seatType]++;
    });

    const doc = {
        trainId: train.id,
        trainNumber: train.trainNumber,
        trainName: train.trainName,
        route: routeStations.map((rs) => ({
            stationId: rs.station.id,
            stationName: rs.station.name,
            stationCode: rs.station.code,
            sequenceNumber: rs.sequenceNumber,
            arrivalTime: rs.arrivalTime,
            departureTime: rs.departureTime,
            distanceFromOrigin: rs.distanceFromOrigin,
        })),
        schedules: [],
        seatSummary,
    };

    await esClient.index({
        index: TRAIN_INDEX,
        id: train.id,
        document: doc,
        refresh: true,
    });

    // Also index/update stations for autocomplete
    for (const rs of routeStations) {
        await esClient.index({
            index: STATION_INDEX,
            id: rs.station.id,
            document: {
                stationId: rs.station.id,
                name: rs.station.name,
                code: rs.station.code,
                city: rs.station.city,
                suggest: {
                    input: [rs.station.name, rs.station.code, rs.station.city].filter(Boolean),
                    weight: 10,
                },
            },
            refresh: true,
        });
    }

    logger.info(`Indexed train ${train.trainNumber} with ${routeStations.length} stations`);
};

/**
 * When admin creates a schedule, add it to the train's schedules array.
 */
const indexSchedule = async (scheduleEvent) => {
    const { scheduleId, trainId, departureDate, status, seats } = scheduleEvent;

    const totalSeats = seats ? seats.length : 0;

    try {
        await esClient.update({
            index: TRAIN_INDEX,
            id: trainId,
            script: {
                source: `
            if (ctx._source.schedules == null) { ctx._source.schedules = []; }
            // Remove existing schedule with same id (idempotent)
            ctx._source.schedules.removeIf(s -> s.scheduleId == params.scheduleId);
            ctx._source.schedules.add(params.newSchedule);
          `,
                params: {
                    scheduleId,
                    newSchedule: {
                        scheduleId,
                        departureDate,
                        status,
                        available: totalSeats,
                        locked: 0,
                        booked: 0,
                    },
                },
            },
            refresh: true,
        });
        logger.info(`Indexed schedule ${scheduleId} for train ${trainId}`);
    } catch (err) {
        logger.warn(`Could not index schedule for train ${trainId}: ${err.message}`);
    }
};
