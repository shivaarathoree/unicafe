package com.spatialmeet.repository;

import com.spatialmeet.model.Room;
import com.spatialmeet.model.RoomStatus;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Pure in-memory room store — no MongoDB needed.
 */
public class RoomRepository {

    private final Map<String, Room> store = new ConcurrentHashMap<>();

    public Optional<Room> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public Room save(Room room) {
        store.put(room.getId(), room);
        return room;
    }

    public void delete(Room room) {
        store.remove(room.getId());
    }

    public List<Room> findAll() {
        return new ArrayList<>(store.values());
    }

    public Iterable<Room> findAllById(Iterable<String> ids) {
        List<Room> result = new ArrayList<>();
        for (String id : ids) {
            Room r = store.get(id);
            if (r != null) result.add(r);
        }
        return result;
    }

    public List<Room> findByIsPublicTrueAndStatusInOrderByLastActivityAtDesc(List<RoomStatus> statuses) {
        return store.values().stream()
                .filter(r -> r.isPublic() && statuses.contains(r.getStatus()))
                .sorted(Comparator.comparing(Room::getLastActivityAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }

    public List<Room> findByIsPublicTrueAndStatusOrderByLastActivityAtDesc(RoomStatus status) {
        return store.values().stream()
                .filter(r -> r.isPublic() && r.getStatus() == status)
                .sorted(Comparator.comparing(Room::getLastActivityAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }

    public List<Room> searchByName(String query) {
        String lq = query.toLowerCase();
        return store.values().stream()
                .filter(r -> r.getName() != null && r.getName().toLowerCase().contains(lq))
                .collect(Collectors.toList());
    }

    public Optional<Room> findByShareCode(String shareCode) {
        return store.values().stream()
                .filter(r -> shareCode.equals(r.getShareCode()))
                .findFirst();
    }

    public List<Room> findByOwnerId(String ownerId) {
        return store.values().stream()
                .filter(r -> ownerId.equals(r.getOwnerId()))
                .collect(Collectors.toList());
    }

    public List<Room> findByLastActivityAtBeforeAndStatus(Instant threshold, RoomStatus status) {
        return store.values().stream()
                .filter(r -> r.getStatus() == status
                        && r.getLastActivityAt() != null
                        && r.getLastActivityAt().isBefore(threshold))
                .collect(Collectors.toList());
    }
}
