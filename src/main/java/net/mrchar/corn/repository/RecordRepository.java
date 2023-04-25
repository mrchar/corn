package net.mrchar.corn.repository;

import net.mrchar.corn.model.Record;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface RecordRepository extends CrudRepository<Record, UUID> {
}
