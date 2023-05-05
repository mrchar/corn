package net.mrchar.corn.repository;

import net.mrchar.corn.model.Record;
import net.mrchar.corn.model.projection.RecordProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "records", excerptProjection = RecordProjection.class)
public interface RecordRepository extends CrudRepository<Record, Long> {
}
