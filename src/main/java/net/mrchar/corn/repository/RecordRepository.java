package net.mrchar.corn.repository;

import net.mrchar.corn.model.Record;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.UUID;

@RepositoryRestResource(path = "records")
public interface RecordRepository extends CrudRepository<Record, Long> {
}
